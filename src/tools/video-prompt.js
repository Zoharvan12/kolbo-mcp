// Validate only explicit, machine-readable declarations. Never infer creative
// intent from adjectives, require a template, or rewrite a user's prompt.
function validateVideoPrompt({ prompt, duration, aspect_ratio, multi_shots, multi_shot_count }) {
  const totals = [...prompt.matchAll(/^\s*Total:\s*(\d+(?:\.\d+)?)s\s*\/\s*(\d+)\s*shots?\s*\/\s*(\d+:\d+)\s*$/gim)]
    .map((m) => ({ duration: Number(m[1]), count: Number(m[2]), aspect: m[3] }));
  if (!totals.length) return; // Existing free-form clients remain supported.
  const total = totals[0];
  const errors = [];
  if (totals.some((t) => t.duration !== total.duration || t.count !== total.count || t.aspect !== total.aspect)) errors.push('Total declarations disagree');
  if (duration != null && duration !== total.duration) errors.push('duration differs from prompt Total');
  if (/^\d+:\d+$/.test(aspect_ratio || '') && aspect_ratio !== total.aspect) errors.push('aspect_ratio differs from prompt Total');
  if (multi_shots === false && total.count > 1) errors.push('multi_shots=false conflicts with multiple declared shots');
  if (multi_shots === true && total.count === 1) errors.push('multi_shots=true conflicts with one declared shot');
  if (multi_shot_count != null && multi_shot_count !== total.count) errors.push('multi_shot_count differs from prompt Total');
  const shots = [...prompt.matchAll(/^\s*SHOT\s+(\d+)\b/gim)].map((m) => Number(m[1]));
  if (shots.length && (shots.length !== total.count || shots.some((n, i) => n !== i + 1))) errors.push('SHOT headings disagree with declared count or order');
  if (errors.length) throw new Error(`Video prompt conflict before submission: ${errors.join('; ')}. Reconcile with the user's approved brief; no generation was submitted.`);
}

module.exports = { validateVideoPrompt };
