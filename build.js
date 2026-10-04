// Builds one self-contained HTML file: dist/index.html
const fs = require('fs');
const shell = fs.readFileSync(__dirname + '/src/index.html', 'utf8');
const core = fs.readFileSync(__dirname + '/src/core.js', 'utf8');
const ui = fs.readFileSync(__dirname + '/src/ui.js', 'utf8');
const out = `${shell}\n<script>\n${core}\n</script>\n<script>\n${ui}\n</script>\n</body></html>\n`;
fs.mkdirSync(__dirname + '/dist', { recursive: true });
fs.writeFileSync(__dirname + '/dist/index.html', out);
console.log('Built dist/index.html (' + Math.round(out.length / 1024) + ' KB)');
