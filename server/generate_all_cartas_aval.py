"""
Script de ejecución única.
Genera la Carta de Aval para cada proyecto que no tenga una y la registra
en thesis_files con file_type='endorsement'.
"""
import sqlite3, json, subprocess, os, uuid, sys
from pathlib import Path

DB_PATH      = Path(__file__).parent / 'data' / 'data.sqlite'
UPLOADS_DIR  = Path(__file__).parent / 'uploads'
FILL_SCRIPT  = Path(__file__).parent / 'fill_carta_aval.py'
TEMPLATE     = Path(__file__).parent.parent / 'Formatos' / 'Carta de Aval Ejemplo.docx'

UPLOADS_DIR.mkdir(exist_ok=True)

con = sqlite3.connect(DB_PATH)
con.row_factory = sqlite3.Row
cur = con.cursor()

cur.execute('''
    SELECT t.id, t.title,
        GROUP_CONCAT(DISTINCT u.full_name)    AS students,
        GROUP_CONCAT(DISTINCT u.student_code) AS codes,
        GROUP_CONCAT(DISTINCT p.name)         AS programs,
        GROUP_CONCAT(DISTINCT ud.full_name)   AS directors
    FROM theses t
    LEFT JOIN thesis_students ts ON ts.thesis_id = t.id
    LEFT JOIN users u             ON u.id = ts.student_id
    LEFT JOIN thesis_programs tp  ON tp.thesis_id = t.id
    LEFT JOIN programs p          ON p.id = tp.program_id
    LEFT JOIN thesis_directors td ON td.thesis_id = t.id
    LEFT JOIN users ud            ON ud.id = td.user_id
    WHERE t.id NOT IN (SELECT thesis_id FROM thesis_files WHERE file_type = "endorsement")
    GROUP BY t.id
''')
rows = cur.fetchall()
print(f"Proyectos sin carta de aval: {len(rows)}")

ok = 0
errors = []

for row in rows:
    thesis_id = row['id']
    data = {
        'titulo':     row['title'] or '',
        'programa':   (row['programs'] or '').split(',')[0].strip(),
        'estudiante': ' y '.join(s.strip() for s in (row['students'] or '').split(',')),
        'codigo':     ' y '.join(c.strip() for c in (row['codes']    or '').split(',')),
        'director':   ' y '.join(d.strip() for d in (row['directors'] or '').split(',')),
    }

    tmp_docx = UPLOADS_DIR / f"carta_aval_{thesis_id}.docx"
    tmp_pdf  = UPLOADS_DIR / f"carta_aval_{thesis_id}.pdf"

    try:
        # 1. Rellenar plantilla
        subprocess.run(
            ['python3', str(FILL_SCRIPT),
             json.dumps(data), str(TEMPLATE), str(tmp_docx)],
            check=True, capture_output=True, text=True
        )
        # 2. Convertir a PDF
        subprocess.run(
            ['soffice', '--headless', '--convert-to', 'pdf',
             '--outdir', str(UPLOADS_DIR), str(tmp_docx)],
            check=True, capture_output=True, text=True
        )
        # 3. Borrar docx temporal
        tmp_docx.unlink(missing_ok=True)

        if not tmp_pdf.exists():
            raise FileNotFoundError(f"PDF no generado: {tmp_pdf}")

        # 4. Registrar en BD
        file_id   = str(uuid.uuid4())
        file_name = f"Carta de Aval - {data['estudiante']}.pdf"
        file_url  = tmp_pdf.name  # solo el nombre, relativo a uploads/

        cur.execute(
            '''INSERT INTO thesis_files (id, thesis_id, file_name, file_type, file_url, uploaded_by)
               VALUES (?, ?, ?, "endorsement", ?, "system")''',
            (file_id, thesis_id, file_name, file_url)
        )
        con.commit()
        print(f"  OK  {thesis_id[:8]}... → {file_name}")
        ok += 1

    except Exception as e:
        errors.append((thesis_id, str(e)))
        print(f"  ERR {thesis_id[:8]}... → {e}", file=sys.stderr)
        tmp_docx.unlink(missing_ok=True)

print(f"\nGeneradas: {ok}/{len(rows)}")
if errors:
    print(f"Errores ({len(errors)}):")
    for tid, msg in errors:
        print(f"  {tid}: {msg}")

con.close()
