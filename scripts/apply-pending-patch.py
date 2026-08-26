from pathlib import Path

patch = Path('scripts/apply-collision-projector-v2.py')
if not patch.exists():
    raise SystemExit('collision projector patch missing')
code = patch.read_text(encoding='utf-8')
exec(compile(code, str(patch), 'exec'), {'__file__': str(patch), '__name__': '__main__'})
Path(__file__).unlink()
print('NIVA collision projector patch entrypoint consumed')
