"""Deterministic, allowlisted WordPress package. Never includes secrets or tests."""
from pathlib import Path
from zipfile import ZipFile, ZipInfo, ZIP_DEFLATED
from hashlib import sha256

root = Path(__file__).resolve().parent.parent
source = root / 'integrations/wordpress/pricing-bridge'
output = root / 'apps/web/public/downloads/pricing-bridge-0.1.0.zip'
output.parent.mkdir(parents=True, exist_ok=True)
with ZipFile(output, 'w', compression=ZIP_DEFLATED) as archive:
    for name in ('pricing-bridge.php', 'uninstall.php', 'readme.txt'):
        item = ZipInfo(f'pricing-bridge/{name}', (2026, 11, 15, 0, 0, 0))
        item.compress_type = ZIP_DEFLATED
        item.external_attr = 0o100644 << 16
        archive.writestr(item, (source / name).read_bytes())
digest = sha256(output.read_bytes()).hexdigest()
output.with_suffix('.zip.sha256').write_text(f'{digest}  {output.name}\n', encoding='utf-8')
print(f'Packaged 3 allowlisted files; SHA-256 {digest}')
