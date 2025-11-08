import fs from 'fs';
import path from 'path';
import sharp from 'sharp';

const projectRoot = process.cwd();
const publicDir = path.join(projectRoot, 'public');

// Lista candidatos automaticamente em public (sem precisar renomear)
function findCandidateImage() {
  const prefer = [
    path.join(publicDir, 'profile-source.jpg'),
    path.join(publicDir, 'profile-source.png'),
  ];
  for (const p of prefer) {
    if (fs.existsSync(p)) return p;
  }
  const exclude = new Set([
    'profile-fixed.jpg',
    'logo192.png',
    'logo512.png',
    'favicon.ico',
    'favicon.svg',
    'icon-192.svg',
    'icon-512.svg',
    'index.html',
    'manifest.json',
    'robots.txt',
    'sw.js'
  ]);
  const files = fs.readdirSync(publicDir).filter((f) => {
    const ext = path.extname(f).toLowerCase();
    const isImg = ['.jpg', '.jpeg', '.png'].includes(ext);
    return isImg && !exclude.has(f);
  }).map((f) => ({
    file: f,
    full: path.join(publicDir, f),
    stat: fs.statSync(path.join(publicDir, f))
  }));
  if (!files.length) return null;
  // Escolhe o mais recente por mtime
  files.sort((a, b) => b.stat.mtimeMs - a.stat.mtimeMs);
  return files[0].full;
}

const existing = findCandidateImage() || (fs.existsSync(path.join(publicDir, 'profile-fixed.jpg')) ? path.join(publicDir, 'profile-fixed.jpg') : null);
if (!existing) {
  console.error('[crop-profile] Nenhuma imagem encontrada em public/. Arraste sua foto para a pasta public e rode: npm run crop:profile');
  process.exit(1);
}

(async () => {
  try {
    const outPath = path.join(publicDir, 'profile-fixed.jpg');
    const img = sharp(existing);
    const meta = await img.metadata();
    const width = meta.width || 0;
    const height = meta.height || 0;
    if (!width || !height) {
      throw new Error('Dimensões da imagem não detectadas');
    }

    // Recorte quadrado com foco no topo (top-centered)
    const side = Math.min(width, height);
    const left = Math.max(0, Math.floor((width - side) / 2));
    const top = 0;

    const cropped = await img
      .extract({ left, top, width: side, height: side })
      .resize(1024, 1024)
      .jpeg({ quality: 85, chromaSubsampling: '4:4:4' })
      .toBuffer();

    await fs.promises.writeFile(outPath, cropped);

    console.log(`[crop-profile] Recorte concluído: ${outPath}`);
    console.log(`[crop-profile] Fonte usada: ${path.relative(projectRoot, existing)}`);
  } catch (err) {
    console.error('[crop-profile] Falhou ao recortar:', err?.message || err);
    process.exit(1);
  }
})();