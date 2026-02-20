#!/bin/bash
set -e

# ============================================================
# Azure Deployment Script - ATS Resume Optimizer
# Deploys to Azure Container Instances with Docker + MongoDB
# ============================================================

# Configuration
RESOURCE_GROUP="TECHGENE_group"
LOCATION="eastus"
ACR_NAME="resumematchacr"
STORAGE_ACCOUNT="resumematchstore"
FILE_SHARE="mongodata"
CONTAINER_GROUP="resume-match-cg"
IMAGE_NAME="ats-resume-optimizer"
IMAGE_TAG="latest"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo -e "${GREEN}=== ATS Resume Optimizer - Azure Deployment ===${NC}"

# ----------------------------------------------------------
# Step 0: Check prerequisites
# ----------------------------------------------------------
echo -e "\n${YELLOW}[0/6] Checking prerequisites...${NC}"
if ! command -v az &> /dev/null; then
    echo -e "${RED}Azure CLI not found. Install it: https://docs.microsoft.com/en-us/cli/azure/install-azure-cli${NC}"
    exit 1
fi

# Check login status
if ! az account show &> /dev/null; then
    echo "Not logged in. Running az login..."
    az login
fi

echo -e "${GREEN}Logged in as: $(az account show --query user.name -o tsv)${NC}"
echo "Subscription: $(az account show --query name -o tsv)"

# Verify resource group exists
if ! az group show --name "$RESOURCE_GROUP" &> /dev/null; then
    echo -e "${RED}Resource group '$RESOURCE_GROUP' not found!${NC}"
    exit 1
fi
echo -e "${GREEN}Resource group '$RESOURCE_GROUP' confirmed.${NC}"

# ----------------------------------------------------------
# Step 1: Create Azure Container Registry
# ----------------------------------------------------------
echo -e "\n${YELLOW}[1/6] Creating Azure Container Registry...${NC}"
if az acr show --name "$ACR_NAME" --resource-group "$RESOURCE_GROUP" &> /dev/null; then
    echo "ACR '$ACR_NAME' already exists, reusing."
else
    az acr create \
        --name "$ACR_NAME" \
        --resource-group "$RESOURCE_GROUP" \
        --sku Basic \
        --admin-enabled true \
        --location "$LOCATION"
    echo -e "${GREEN}ACR '$ACR_NAME' created.${NC}"
fi

# Get ACR credentials
ACR_LOGIN_SERVER=$(az acr show --name "$ACR_NAME" --query loginServer -o tsv)
ACR_USERNAME=$(az acr credential show --name "$ACR_NAME" --query username -o tsv)
ACR_PASSWORD=$(az acr credential show --name "$ACR_NAME" --query "passwords[0].value" -o tsv)

echo "ACR Login Server: $ACR_LOGIN_SERVER"

# ----------------------------------------------------------
# Step 2: Create Storage Account + File Share for MongoDB
# ----------------------------------------------------------
echo -e "\n${YELLOW}[2/6] Creating Storage Account + File Share...${NC}"
if az storage account show --name "$STORAGE_ACCOUNT" --resource-group "$RESOURCE_GROUP" &> /dev/null; then
    echo "Storage account '$STORAGE_ACCOUNT' already exists, reusing."
else
    az storage account create \
        --name "$STORAGE_ACCOUNT" \
        --resource-group "$RESOURCE_GROUP" \
        --location "$LOCATION" \
        --sku Standard_LRS
    echo -e "${GREEN}Storage account '$STORAGE_ACCOUNT' created.${NC}"
fi

STORAGE_KEY=$(az storage account keys list \
    --account-name "$STORAGE_ACCOUNT" \
    --resource-group "$RESOURCE_GROUP" \
    --query "[0].value" -o tsv)

# Create file share for MongoDB data
if az storage share show --name "$FILE_SHARE" --account-name "$STORAGE_ACCOUNT" --account-key "$STORAGE_KEY" &> /dev/null; then
    echo "File share '$FILE_SHARE' already exists, reusing."
else
    az storage share create \
        --name "$FILE_SHARE" \
        --account-name "$STORAGE_ACCOUNT" \
        --account-key "$STORAGE_KEY" \
        --quota 5
    echo -e "${GREEN}File share '$FILE_SHARE' created (5 GB).${NC}"
fi

# ----------------------------------------------------------
# Step 3: Build & Push Docker Image
# ----------------------------------------------------------
echo -e "\n${YELLOW}[3/6] Building Docker image via ACR Tasks...${NC}"
FULL_IMAGE="$ACR_LOGIN_SERVER/$IMAGE_NAME:$IMAGE_TAG"

az acr build \
    --registry "$ACR_NAME" \
    --resource-group "$RESOURCE_GROUP" \
    --image "$IMAGE_NAME:$IMAGE_TAG" \
    --file Dockerfile \
    .

echo -e "${GREEN}Image built and pushed: $FULL_IMAGE${NC}"

# ----------------------------------------------------------
# Step 4: Prompt for secrets
# ----------------------------------------------------------
echo -e "\n${YELLOW}[4/6] Environment configuration...${NC}"

if [ -z "$OPENAI_API_KEY" ]; then
    echo -e "${YELLOW}OPENAI_API_KEY not set in environment.${NC}"
    read -rsp "Enter your OpenAI API Key (input hidden): " OPENAI_API_KEY
    echo ""
fi

if [ -z "$JWT_SECRET" ]; then
    JWT_SECRET=$(openssl rand -hex 32 2>/dev/null || head -c 32 /dev/urandom | xxd -p)
    echo "Generated random JWT_SECRET."
fi

# ----------------------------------------------------------
# Step 5: Delete old container group if exists
# ----------------------------------------------------------
echo -e "\n${YELLOW}[5/6] Preparing container group...${NC}"
if az container show --name "$CONTAINER_GROUP" --resource-group "$RESOURCE_GROUP" &> /dev/null; then
    echo "Deleting existing container group '$CONTAINER_GROUP'..."
    az container delete \
        --name "$CONTAINER_GROUP" \
        --resource-group "$RESOURCE_GROUP" \
        --yes
    echo "Deleted. Waiting 10s for cleanup..."
    sleep 10
fi

# ----------------------------------------------------------
# Step 6: Deploy Container Group (App + MongoDB)
# ----------------------------------------------------------
echo -e "\n${YELLOW}[6/6] Deploying container group...${NC}"

az container create \
    --resource-group "$RESOURCE_GROUP" \
    --name "$CONTAINER_GROUP" \
    --location "$LOCATION" \
    --image "$FULL_IMAGE" \
    --registry-login-server "$ACR_LOGIN_SERVER" \
    --registry-username "$ACR_USERNAME" \
    --registry-password "$ACR_PASSWORD" \
    --cpu 1 \
    --memory 1.5 \
    --ports 5000 \
    --ip-address Public \
    --dns-name-label "resume-match-app" \
    --environment-variables \
        NODE_ENV=production \
        PORT=5000 \
        MONGODB_URI=mongodb://localhost:27017/ats_resume_optimizer \
    --secure-environment-variables \
        OPENAI_API_KEY="$OPENAI_API_KEY" \
        JWT_SECRET="$JWT_SECRET" \
    --azure-file-volume-account-name "$STORAGE_ACCOUNT" \
    --azure-file-volume-account-key "$STORAGE_KEY" \
    --azure-file-volume-share-name "$FILE_SHARE" \
    --azure-file-volume-mount-path /data/db

echo -e "${GREEN}Container group created. Now adding MongoDB sidecar...${NC}"

# ACI multi-container requires YAML for sidecar containers.
# Let's generate and re-deploy with YAML.

# Get the public IP
PUBLIC_IP=$(az container show \
    --name "$CONTAINER_GROUP" \
    --resource-group "$RESOURCE_GROUP" \
    --query ipAddress.ip -o tsv)

FQDN=$(az container show \
    --name "$CONTAINER_GROUP" \
    --resource-group "$RESOURCE_GROUP" \
    --query ipAddress.fqdn -o tsv)

# Delete the simple deployment — we need YAML for multi-container
az container delete \
    --name "$CONTAINER_GROUP" \
    --resource-group "$RESOURCE_GROUP" \
    --yes
sleep 10

# ----------------------------------------------------------
# Deploy with YAML (multi-container: app + MongoDB)
# ----------------------------------------------------------
echo -e "${YELLOW}Deploying multi-container group via YAML...${NC}"

cat > /tmp/aci-deploy.yaml <<YAMLEOF
apiVersion: 2021-09-01
location: ${LOCATION}
name: ${CONTAINER_GROUP}
type: Microsoft.ContainerInstance/containerGroups
properties:
  osType: Linux
  restartPolicy: Always
  imageRegistryCredentials:
    - server: ${ACR_LOGIN_SERVER}
      username: ${ACR_USERNAME}
      password: ${ACR_PASSWORD}
  ipAddress:
    type: Public
    dnsNameLabel: resume-match-app
    ports:
      - protocol: TCP
        port: 5000
  containers:
    - name: app
      properties:
        image: ${FULL_IMAGE}
        ports:
          - port: 5000
        resources:
          requests:
            cpu: 0.5
            memoryInGb: 1
        environmentVariables:
          - name: NODE_ENV
            value: production
          - name: PORT
            value: "5000"
          - name: MONGODB_URI
            value: mongodb://localhost:27017/ats_resume_optimizer
          - name: OPENAI_API_KEY
            secureValue: "${OPENAI_API_KEY}"
          - name: JWT_SECRET
            secureValue: "${JWT_SECRET}"
    - name: mongodb
      properties:
        image: mongo:7
        ports:
          - port: 27017
        resources:
          requests:
            cpu: 0.5
            memoryInGb: 1
        volumeMounts:
          - name: mongovolume
            mountPath: /data/db
  volumes:
    - name: mongovolume
      azureFile:
        shareName: ${FILE_SHARE}
        storageAccountName: ${STORAGE_ACCOUNT}
        storageAccountKey: ${STORAGE_KEY}
YAMLEOF

az container create \
    --resource-group "$RESOURCE_GROUP" \
    --file /tmp/aci-deploy.yaml

# Clean up YAML file
rm -f /tmp/aci-deploy.yaml

# ----------------------------------------------------------
# Output results
# ----------------------------------------------------------
echo -e "\n${GREEN}============================================${NC}"
echo -e "${GREEN}  Deployment Complete!${NC}"
echo -e "${GREEN}============================================${NC}"

PUBLIC_IP=$(az container show \
    --name "$CONTAINER_GROUP" \
    --resource-group "$RESOURCE_GROUP" \
    --query ipAddress.ip -o tsv)

FQDN=$(az container show \
    --name "$CONTAINER_GROUP" \
    --resource-group "$RESOURCE_GROUP" \
    --query ipAddress.fqdn -o tsv)

echo ""
echo -e "Public IP:  ${GREEN}http://${PUBLIC_IP}:5000${NC}"
echo -e "FQDN:       ${GREEN}http://${FQDN}:5000${NC}"
echo ""
echo "Useful commands:"
echo "  View logs:     az container logs --name $CONTAINER_GROUP -g $RESOURCE_GROUP --container-name app"
echo "  Mongo logs:    az container logs --name $CONTAINER_GROUP -g $RESOURCE_GROUP --container-name mongodb"
echo "  Status:        az container show --name $CONTAINER_GROUP -g $RESOURCE_GROUP --query instanceView.state"
echo "  Restart:       az container restart --name $CONTAINER_GROUP -g $RESOURCE_GROUP"
echo "  Delete:        az container delete --name $CONTAINER_GROUP -g $RESOURCE_GROUP --yes"
