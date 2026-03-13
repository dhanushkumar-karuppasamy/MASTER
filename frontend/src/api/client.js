/**
 * API client for the Flask backend.
 * All functions return the Axios response data (JSON).
 */
import axios from 'axios';

const api = axios.create({
  baseURL: 'http://localhost:5001',
  timeout: 180000,
});

/** Initialise simulation with given parameters, active agents, and per-agent params */
export async function initSimulation(
  ticker,
  period,
  interval,
  activeAgents = null,
  agentParams = null,
  options = {},
) {
  const { startDate = null, endDate = null, csvFile = null } = options;

  if (csvFile) {
    const form = new FormData();
    form.append('ticker', ticker);
    form.append('interval', interval);
    if (startDate && endDate) {
      form.append('start_date', startDate);
      form.append('end_date', endDate);
    } else {
      form.append('period', period);
    }
    if (activeAgents) form.append('active_agents', JSON.stringify(activeAgents));
    if (agentParams) form.append('agent_params', JSON.stringify(agentParams));
    form.append('custom_data', csvFile);
    const res = await api.post('/api/init', form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return res.data;
  }

  const body = { ticker, interval };
  if (startDate && endDate) {
    body.start_date = startDate;
    body.end_date = endDate;
  } else {
    body.period = period;
  }
  if (activeAgents) body.active_agents = activeAgents;
  if (agentParams) body.agent_params = agentParams;
  const res = await api.post('/api/init', body, {
    headers: { 'Content-Type': 'application/json' },
  });
  return res.data;
}

/** Advance one simulation step (or N steps via query param) */
export async function stepSimulation(n = 1) {
  const res = await api.post(`/api/step?n=${n}`);
  return res.data;
}

/** Run N steps in one call */
export async function autoStepSimulation(steps = 10) {
  const res = await api.post('/api/auto-step', { steps });
  return res.data;
}

/** Jump (scrub) to a specific step */
export async function jumpToStep(step) {
  const res = await api.post('/api/jump', { step }, { timeout: 120000 });
  return res.data;
}

/** Trigger a market crash event */
export async function triggerCrash() {
  const res = await api.post('/api/trigger-crash');
  return res.data;
}

/** Get current snapshot */
export async function getState() {
  const res = await api.get('/api/state');
  return res.data;
}

/** Enable/disable agents mid-simulation without re-init */
export async function setActiveAgents(activeAgents) {
  const res = await api.post('/api/set-agents', { active_agents: activeAgents });
  return res.data;
}

/** Liquidate (sell all positions for) a specific agent at current market price */
export async function liquidateAgent(agentKey) {
  const res = await api.post('/api/liquidate-agent', { agent_key: agentKey });
  return res.data;
}

/** Get available Ollama models for LLM agent */
export async function getOllamaModels() {
  const res = await api.get('/api/ollama-models');
  return res.data;
}

/** Run optimizer parameter sweep */
export async function optimizeSimulation(payload) {
  try {
    const res = await api.post('/api/optimize', payload, {
      headers: { 'Content-Type': 'application/json' },
    });
    const data = res?.data || {};
    if (!Array.isArray(data.results)) {
      data.results = [];
    }
    return data;
  } catch (err) {
    const msg = err?.response?.data?.error || err?.message || 'Optimizer request failed';
    throw new Error(msg);
  }
}
