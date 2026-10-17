const fs = require('node:fs');
const path = require('node:path');

exports.default = async function afterPack(context) {
  const src = path.join(context.packager.projectDir, '.next', 'standalone', 'node_modules');
  const dest = path.join(context.appOutDir, 'resources', 'next', 'node_modules');

  if (!fs.existsSync(src)) {
    throw new Error(
      `node_modules do standalone não encontrado em ${src}. ` +
      `Rode "npm run build" antes e confirme que o next.config tem output: 'standalone'.`
    );
  }

  fs.mkdirSync(dest, { recursive: true });
  fs.cpSync(src, dest, { recursive: true, force: true });

  const nextPkg = path.join(dest, 'next', 'package.json');
  if (!fs.existsSync(nextPkg)) {
    throw new Error(`Cópia falhou: ${nextPkg} não existe.`);
  }
  console.log(`[afterPack] node_modules copiado para ${dest}`);
};