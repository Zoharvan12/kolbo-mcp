// Offline API boundary: only downloads the supplied public reference. Never
// creates a real profile or reads credentials. Compile this to test Bun's actual
// bundled transport, then pass a small public image URL as the sole argument.
const { resolveToBuffer } = require('../src/tools/_shared');
const { registerVisualDnaTools } = require('../src/tools/visual_dna');

const source = process.argv[2];
if (!source || !/^https:\/\//.test(source)) {
  console.error('Usage: check-bun-media <public-https-image-url>');
  process.exit(2);
}
const timer = setTimeout(() => { console.error('Media runtime probe timed out'); process.exit(1); }, 25000);

(async () => {
  const reference = await resolveToBuffer(source, 'image');
  if (!reference.size) throw new Error('Empty reference');
  const handlers = {};
  let calls = 0;
  registerVisualDnaTools({ tool(name, description, schema, handler) { handlers[name] = handler; } }, {
    async postMultipart(route, form) {
      calls++;
      if (route !== '/v1/visual-dna' || !form.getBuffer().includes(reference.buffer)) throw new Error('Reference missing from DNA payload');
      return { visual_dna: { id: 'local-probe-only', dna_type: 'character' } };
    },
  });
  const result = await handlers.create_visual_dna({ name: 'runtime_probe', dna_type: 'character', images: [source] });
  if (calls !== 1 || JSON.parse(result.content[0].text).id !== 'local-probe-only') throw new Error('Unexpected submission');
  console.log(JSON.stringify({ runtime: process.versions.bun || process.version, downloadedBytes: reference.size, simulatedSubmissions: calls, externalWrites: 0 }));
})().catch((err) => { console.error(err); process.exitCode = 1; }).finally(() => clearTimeout(timer));
