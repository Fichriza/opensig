/* OpenSig AI signal report: sends computed signal metrics (never raw samples) to an LLM and shows the report.
   Providers: Anthropic Messages API (default) or any OpenAI-compatible chat-completions endpoint. */
(function (root) {
  'use strict';
  const { HOST } = root;

  const DEFAULTS = { provider: 'anthropic', apiKey: '', model: 'claude-opus-5-5', baseUrl: '', effort: 'medium', transcribeModel: 'whisper-1' };
  const AI = {
    settings: Object.assign({}, DEFAULTS),
    load() { try { Object.assign(this.settings, JSON.parse(localStorage.getItem('opensig.ai') || '{}')); } catch (e) { /* storage unavailable */ } },
    save() { try { localStorage.setItem('opensig.ai', JSON.stringify(this.settings)); } catch (e) { /* storage unavailable */ } },
    get configured() { return !!(this.settings.apiKey && this.settings.model); },

    MODES: [
      { id: 'overview', label: 'General signal description', system:
        'You are a signal-analysis assistant inside OpenSig. You receive a JSON report of metrics computed from one signal; every metric has a description. Write a clear, well-structured description of the signal for a technical reader, using the actual numbers to support each statement. Sections: Overview (duration, sample rate, likely signal type and why), Amplitude and distribution, Spectral character, Behaviour over time, Signal quality (SNR, THD, THD+N — note that a high THD is normal for broadband or non-tonal signals), and 2–3 key observations. Be concise (300–600 words). Use Markdown headings and short paragraphs.' },
      { id: 'anomaly', label: 'Anomaly and fault indicators', system:
        'You are a condition-monitoring analyst inside OpenSig. From the JSON metrics of one signal, look for indicators of anomalies or faults: impulsiveness (kurtosis, crest factor), drifts or level changes in the over-time table, harmonic patterns, unexpected spectral peaks, clipping (max/min at identical magnitudes with high kurtosis), DC offsets and noise floor issues. For each finding give the metric values, a plausible cause and a suggested next measurement in OpenSig (e.g. spectrogram, envelope, order analysis). Say clearly when the data shows nothing unusual. Use Markdown with a short summary first.' },
      { id: 'vibration', label: 'Vibration / machinery analysis', system:
        'You are a vibration analyst inside OpenSig. Interpret the JSON metrics of one vibration signal: overall level (RMS, peak-to-peak), dominant and fundamental frequencies, harmonic ratios (could indicate misalignment or looseness), kurtosis/crest factor (bearing impacts), octave-band distribution, and stability over time. Relate findings to common machine faults where the evidence supports it, and state the uncertainty because rotational speed and sensor units may be unknown. Use Markdown; keep it under 600 words.' },
      { id: 'audio', label: 'Audio / acoustics assessment', system:
        'You are an audio engineer inside OpenSig. Using the JSON metrics of one audio signal, describe its tonal balance (spectral centroid, flatness, octave bands), dynamics (crest factor, RMS over time), distortion (THD, THD+N), noise (SNR) and whether it looks like speech, music, tones or noise. Give practical recommendations (EQ, gain staging, noise reduction) only where the numbers justify them. Use Markdown; under 500 words.' },
      { id: 'biomedical', label: 'Biomedical signal overview', system:
        'You are a biomedical signal-processing assistant inside OpenSig. From the JSON metrics of one physiological signal (e.g. ECG, EEG, EMG), describe sampling adequacy, amplitude range, dominant rhythms or frequency content, artefact indicators (baseline drift, line-frequency peaks near 50/60 Hz, clipping) and temporal stability. Do not give medical diagnoses; describe signal properties only and suggest further signal checks. Use Markdown; under 500 words.' },
      { id: 'summary', label: 'One-paragraph summary', system:
        'You are a signal-analysis assistant inside OpenSig. Summarise the signal described by the JSON metrics in one paragraph of at most 120 words for a measurement log, citing the most important numbers.' }
    ],

    prompt(modeId, metrics, info, notes) {
      const mode = this.MODES.find(m => m.id === modeId) || this.MODES[0];
      const user = 'Signal: ' + info + '\n\n' + (notes ? 'Additional information from the user:\n' + notes + '\n\n' : '') +
        'Metrics (JSON):\n' + JSON.stringify(metrics, (k, v) => typeof v === 'number' ? Number(v.toPrecision(6)) : v, 1);
      return { system: mode.system, user, mode };
    },

    async request(url, headers, body) {
      if (HOST && HOST.available) {
        const r = await HOST.call('http', { url, method: 'POST', headers, body: JSON.stringify(body) });
        return { status: r.status, json: (() => { try { return JSON.parse(r.body); } catch (e) { return { error: { message: r.body.slice(0, 300) } }; } })() };
      }
      const r = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body) });
      return { status: r.status, json: await r.json().catch(() => ({ error: { message: 'Invalid JSON response' } })) };
    },

    // Returns the report text. maxTokens is generous so long reports are not cut off.
    async complete(system, user, opts) {
      const s = this.settings; opts = opts || {};
      if (!s.apiKey) throw new Error('Configure a provider and API key first (AI signal report ▸ Settings).');
      if (s.provider === 'anthropic') {
        const base = (s.baseUrl || 'https://api.anthropic.com').replace(/\/+$/, '');
        const official = /^https:\/\/api\.anthropic\.com$/.test(base);
        const headers = { 'content-type': 'application/json', 'x-api-key': s.apiKey, 'anthropic-version': '2023-06-01' };
        if (!(HOST && HOST.available)) headers['anthropic-dangerous-direct-browser-access'] = 'true';
        const body = { model: s.model, max_tokens: opts.maxTokens || 16000, system, messages: [{ role: 'user', content: user }] };
        if (/^claude-(opus|sonnet|fable|haiku)-5/.test(s.model) || /^claude-opus-4-[678]/.test(s.model)) body.output_config = { effort: opts.effort || s.effort || 'medium' };
        // Server-side refusal fallback ("default" routing) on the models and platform that support it.
        if (official && /^claude-(fable-5-1|opus-5-5|opus-5|sonnet-5-5)$/.test(s.model)) { headers['anthropic-beta'] = 'server-side-fallback-2026-07-01'; body.fallbacks = 'default'; }
        const r = await this.request(base + '/v1/messages', headers, body);
        if (r.status >= 400 || r.json.type === 'error') throw new Error(`Anthropic API error ${r.status}: ${(r.json.error && r.json.error.message) || 'request failed'}`);
        if (r.json.stop_reason === 'refusal') {
          const d = r.json.stop_details || {};
          throw new Error('The model declined this request' + (d.category ? ` (${d.category})` : '') + (d.explanation ? ': ' + d.explanation : '.'));
        }
        const text = (r.json.content || []).filter(b => b.type === 'text').map(b => b.text).join('');
        return { text, model: r.json.model, truncated: r.json.stop_reason === 'max_tokens' };
      }
      const base = (s.baseUrl || 'https://api.openai.com/v1').replace(/\/+$/, '');
      const r = await this.request(base + '/chat/completions', { 'content-type': 'application/json', authorization: 'Bearer ' + s.apiKey },
        { model: s.model, messages: [{ role: 'system', content: system }, { role: 'user', content: user }] });
      if (r.status >= 400 || r.json.error) throw new Error(`API error ${r.status}: ${(r.json.error && (r.json.error.message || r.json.error)) || 'request failed'}`);
      const c = r.json.choices && r.json.choices[0];
      return { text: (c && c.message && c.message.content) || '', model: r.json.model, truncated: c && c.finish_reason === 'length' };
    },

    async test() {
      const r = await this.complete('Reply with the single word OK.', 'Connection test.', { maxTokens: 2048, effort: 'low' });
      return r.text.trim().slice(0, 80) || '(empty reply)';
    },

    // Speech-to-text via an OpenAI-compatible /audio/transcriptions endpoint (multipart upload of a WAV).
    async transcribe(wavBuffer) {
      const s = this.settings;
      if (s.provider === 'anthropic') throw new Error('Speech-to-text needs an OpenAI-compatible provider with an /audio/transcriptions endpoint (AI signal report ▸ Settings).');
      if (!s.apiKey) throw new Error('Configure the API key first.');
      const base = (s.baseUrl || 'https://api.openai.com/v1').replace(/\/+$/, ''), fd = new FormData();
      fd.append('file', new Blob([wavBuffer], { type: 'audio/wav' }), 'signal.wav'); fd.append('model', s.transcribeModel || 'whisper-1');
      const r = await fetch(base + '/audio/transcriptions', { method: 'POST', headers: { authorization: 'Bearer ' + s.apiKey }, body: fd });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(`Transcription error ${r.status}: ${(j.error && j.error.message) || 'request failed'}`);
      return j.text || '';
    }
  };
  AI.load();
  root.AI = AI;
})(window);
