const axios = require('axios');
const { Pool } = require('pg');

const pool = new Pool({ connectionString: 'postgresql://postgres:Anshu@12345@localhost:5432/ats_resume_optimizer' });

async function run() {
  // Get latest candidate + latest job
  const cRes = await pool.query("SELECT id, raw_text, personal_info->>'name' as name FROM candidates ORDER BY created_at DESC LIMIT 1");
  const jRes = await pool.query("SELECT id, raw_text, title FROM jobs ORDER BY created_at DESC LIMIT 1");

  const candidate = cRes.rows[0];
  const job = jRes.rows[0];

  console.log('=== CANDIDATE:', candidate.name, '===');
  console.log('=== JOB:', job.title, '===\n');

  // Test section split on resume
  console.log('--- Resume section embeddings ---');
  const rEmb = await axios.post('http://localhost:5001/embed-sections', { text: candidate.raw_text, type: 'passage' });
  const rSecs = rEmb.data.embeddings;
  Object.entries(rSecs).forEach(([sec, vec]) => {
    const v = vec;
    const nonzero = v.filter(x => x !== 0).length;
    const mag = Math.sqrt(v.reduce((s, x) => s + x*x, 0)).toFixed(4);
    console.log(`  ${sec.padEnd(12)} dim=${v.length}  nonzero=${nonzero}  magnitude=${mag}  ${nonzero === 0 ? '❌ EMPTY' : '✅'}`);
  });

  // Test section split on JD
  console.log('\n--- JD section embeddings ---');
  const jEmb = await axios.post('http://localhost:5001/embed-sections', { text: job.raw_text, type: 'query' });
  const jSecs = jEmb.data.embeddings;
  Object.entries(jSecs).forEach(([sec, vec]) => {
    const v = vec;
    const nonzero = v.filter(x => x !== 0).length;
    const mag = Math.sqrt(v.reduce((s, x) => s + x*x, 0)).toFixed(4);
    console.log(`  ${sec.padEnd(12)} dim=${v.length}  nonzero=${nonzero}  magnitude=${mag}  ${nonzero === 0 ? '❌ EMPTY' : '✅'}`);
  });

  // Compute section cosine similarities
  console.log('\n--- Section cosine similarities (JD vs Resume) ---');
  const sections = ['skills', 'experience', 'education', 'summary'];
  const weights =  { skills: 0.40, experience: 0.30, education: 0.15, summary: 0.15 };
  let totalScore = 0;
  for (const sec of sections) {
    const a = jSecs[sec], b = rSecs[sec];
    if (!a || !b || a.length === 0 || b.length === 0) {
      console.log(`  ${sec.padEnd(12)} SKIPPED (empty)`);
      continue;
    }
    let dot = 0, na = 0, nb = 0;
    for (let i = 0; i < a.length; i++) { dot += a[i]*b[i]; na += a[i]*a[i]; nb += b[i]*b[i]; }
    const sim = dot / (Math.sqrt(na) * Math.sqrt(nb));
    const contribution = sim * weights[sec] * 100;
    totalScore += contribution;
    console.log(`  ${sec.padEnd(12)} sim=${sim.toFixed(4)}  weight=${weights[sec]}  contribution=${contribution.toFixed(1)}`);
  }
  console.log(`\n  FINAL section semantic score = ${Math.round(totalScore)}`);

  // Check if job has section embeddings stored
  const jobHasEmb = await pool.query("SELECT section_embeddings IS NOT NULL as has_emb FROM jobs WHERE id = $1", [job.id]);
  console.log('\n--- DB check ---');
  console.log('  Job has stored section_embeddings:', jobHasEmb.rows[0]?.has_emb);
  const candHasEmb = await pool.query("SELECT section_embeddings IS NOT NULL as has_emb, score_breakdown->>'sectionSemanticScore' as sem FROM candidates WHERE id = $1", [candidate.id]);
  console.log('  Candidate has stored section_embeddings:', candHasEmb.rows[0]?.has_emb);
  console.log('  Candidate stored sectionSemanticScore:', candHasEmb.rows[0]?.sem);

  pool.end();
}

run().catch(e => { console.error('ERROR:', e.message); pool.end(); });
