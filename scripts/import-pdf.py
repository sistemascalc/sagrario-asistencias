"""Local import only. Personal data is deliberately ignored by Git."""
import json, sys, pathlib, re
import pdfplumber

source = pathlib.Path(sys.argv[1])
rows = []
with pdfplumber.open(source) as pdf:
    for page_no, page in enumerate(pdf.pages, 1):
        for table in page.extract_tables():
            for r in table:
                if len(r) == 8 and r[0] is None and page_no in (2, 3) and r[1]:
                    r[0] = re.match(r'\d+', page.extract_text()).group(0)
                if len(r) != 8 or not r[0] or not r[0].strip().isdigit():
                    continue
                clean = lambda x: re.sub(r'\s+', ' ', x or '').strip()
                rows.append({"id":int(r[0]), "givenNames":clean(r[1]), "paternalSurname":clean(r[2]),
                    "maternalSurname":clean(r[3]), "sponsor":clean(r[6]), "notes":clean(r[7]),
                    "sourcePage":page_no, "originalMarks":{"confirmand":clean(r[4]),"sponsor":clean(r[5])}})
assert [r['id'] for r in rows] == list(range(1,266)), 'Check PDF row sequence'
# A source X is preserved verbatim for review; it is not assumed to mean attendance.
seed = {"schemaVersion":1,"date":"2026-10-18","title":"Catequesis · UNEDEL",
        "source":source.name,"people":rows,"attendance":{}}
for row in rows:
    marks = row['originalMarks']
    if any(marks.values()):
        seed['attendance'][str(row['id'])] = {"confirmand":False,"sponsor":False,
            "notes":"Marca original del PDF: " + ', '.join(k + ' = ' + v for k,v in marks.items() if v) + '. Pendiente de verificar.'}
pathlib.Path('data/seed.json').write_text(json.dumps(seed,ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps({'records':len(rows),'date':seed['date'],'sourceMarks':seed['attendance'],'notes':[r['id'] for r in rows if r['notes']]},ensure_ascii=True))
