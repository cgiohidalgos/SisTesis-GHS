// Script para recalcular estados de tesis en submitted donde todos los evaluadores han evaluado

const Database = require('better-sqlite3');
const { v4: uuidv4 } = require('uuid');
const db = new Database('./data/data.sqlite');
const nowSec = () => Math.floor(Date.now() / 1000);

function recalculateSubmittedTheses() {
  // Buscar tesis en estado submitted
  const theses = db.prepare(`
    SELECT id, title, status 
    FROM theses 
    WHERE status = 'submitted'
  `).all();

  console.log(`\nEncontradas ${theses.length} tesis en estado 'submitted':\n`);

  for (const thesis of theses) {
    console.log(`\nTesis: ${thesis.title}`);
    
    // Contar evaluadores asignados
    const assignedCount = db.prepare(`
      SELECT COUNT(*) as count 
      FROM thesis_evaluators 
      WHERE thesis_id = ?
    `).get(thesis.id).count;
    
    if (assignedCount === 0) {
      console.log('  Sin evaluadores asignados, omitiendo...');
      continue;
    }
    
    // Obtener la evaluación más reciente de documento de cada evaluador
    const evals = db.prepare(`
      SELECT e.concept FROM evaluations e
      JOIN thesis_evaluators te ON te.id = e.thesis_evaluator_id
      WHERE te.thesis_id = ?
      AND e.evaluation_type = 'document'
      AND e.submitted_at = (
        SELECT MAX(submitted_at) FROM evaluations e2
        WHERE e2.thesis_evaluator_id = e.thesis_evaluator_id
        AND e2.evaluation_type = 'document'
      )
    `).all(thesis.id).map(r => r.concept);
    
    console.log(`  Evaluadores asignados: ${assignedCount}`);
    console.log(`  Evaluaciones recibidas: ${evals.length}`);
    
    if (evals.length === 0) {
      console.log('  Sin evaluaciones, estado correcto');
      continue;
    }
    
    if (evals.length < assignedCount) {
      // Partial evaluation - should be "en_evaluacion"
      console.log('  ⚠️  Evaluación parcial detectada');
      console.log('  Cambiando estado a: en_evaluacion');
      
      db.prepare('UPDATE theses SET status = ? WHERE id = ?').run('en_evaluacion', thesis.id);
      db.prepare(`
        INSERT INTO thesis_timeline (id, thesis_id, event_type, description, completed, created_at) 
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(
        uuidv4(), 
        thesis.id, 
        'status_changed', 
        `En evaluación (${evals.length}/${assignedCount} evaluadores)`, 
        1, 
        nowSec()
      );
      
      console.log(`  ✅ Estado actualizado a en_evaluacion`);
      continue;
    }
    
    // All evaluators have submitted - calculate final status
    let newStatus = null;
    if (evals.some(c => c === 'major_changes')) {
      newStatus = 'revision_cuidados';
    } else if (evals.some(c => c === 'minor_changes')) {
      newStatus = 'revision_minima';
    } else if (evals.every(c => c === 'accepted') && evals.length >= 2) {
      newStatus = 'sustentacion';
    }
    
    if (newStatus) {
      console.log(`  ✅ Todas las evaluaciones completas`);
      console.log(`  Conceptos: ${evals.join(', ')}`);
      console.log(`  Cambiando estado a: ${newStatus}`);
      
      db.prepare('UPDATE theses SET status = ? WHERE id = ?').run(newStatus, thesis.id);
      db.prepare(`
        INSERT INTO thesis_timeline (id, thesis_id, event_type, description, completed, created_at) 
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(
        uuidv4(), 
        thesis.id, 
        'status_changed', 
        `Estado cambiado a ${newStatus}`, 
        1, 
        nowSec()
      );
      
      console.log(`  ✅ Estado actualizado correctamente`);
    } else {
      console.log('  No se pudo determinar nuevo estado');
    }
  }
  
  console.log('\n✅ Proceso completado\n');
}

try {
  recalculateSubmittedTheses();
} catch (error) {
  console.error('Error:', error);
  process.exit(1);
} finally {
  db.close();
}
