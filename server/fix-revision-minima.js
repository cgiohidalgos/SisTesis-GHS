// Script para corregir estados de tesis que están en revision_minima o revision_cuidados
// pero donde no todos los evaluadores han completado su evaluación

const Database = require('better-sqlite3');
const db = new Database('./data/data.sqlite');

function checkAndFixThesis() {
  // Buscar tesis en revision_minima, revision_cuidados o en_evaluacion
  const theses = db.prepare(`
    SELECT id, title, status 
    FROM theses 
    WHERE status IN ('revision_minima', 'revision_cuidados', 'en_evaluacion')
  `).all();

  console.log(`\nEncontradas ${theses.length} tesis en revisión:\n`);

  for (const thesis of theses) {
    console.log(`\nTesis: ${thesis.title}`);
    console.log(`Estado actual: ${thesis.status}`);
    
    // Contar evaluadores asignados
    const assignedCount = db.prepare(`
      SELECT COUNT(*) as count 
      FROM thesis_evaluators 
      WHERE thesis_id = ?
    `).get(thesis.id).count;
    
    // Contar evaluaciones de documento recibidas (la más reciente de cada evaluador)
    const evalCount = db.prepare(`
      SELECT COUNT(DISTINCT te.evaluator_id) as count
      FROM evaluations e
      JOIN thesis_evaluators te ON te.id = e.thesis_evaluator_id
      WHERE te.thesis_id = ?
      AND e.evaluation_type = 'document'
      AND e.submitted_at = (
        SELECT MAX(submitted_at) 
        FROM evaluations e2
        WHERE e2.thesis_evaluator_id = e.thesis_evaluator_id
        AND e2.evaluation_type = 'document'
      )
    `).get(thesis.id).count;
    
    console.log(`Evaluadores asignados: ${assignedCount}`);
    console.log(`Evaluaciones recibidas: ${evalCount}`);
    
    if (evalCount < assignedCount) {
      console.log(`⚠️  PROBLEMA: Faltan ${assignedCount - evalCount} evaluación(es)`);
      console.log(`Revirtiendo estado a 'submitted'...`);
      
      // Revertir a submitted
      db.prepare('UPDATE theses SET status = ? WHERE id = ?').run('submitted', thesis.id);
      
      // Agregar evento al timeline
      const { v4: uuidv4 } = require('uuid');
      const nowSec = () => Math.floor(Date.now() / 1000);
      db.prepare(`
        INSERT INTO thesis_timeline (id, thesis_id, event_type, description, completed, created_at) 
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(
        uuidv4(), 
        thesis.id, 
        'status_changed', 
        'Estado corregido a submitted (esperando evaluaciones faltantes)', 
        1, 
        nowSec()
      );
      
      console.log('✅ Estado corregido a submitted');
    } else {
      console.log('✅ Todas las evaluaciones completas, estado correcto');
    }
  }
  
  console.log('\n✅ Proceso completado\n');
}

try {
  checkAndFixThesis();
} catch (error) {
  console.error('Error:', error);
} finally {
  db.close();
}
