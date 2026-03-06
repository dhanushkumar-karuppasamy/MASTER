/**
 * API client for the Flask backend.
 * All functions return the Axios response data (JSON).
 */
import axios from 'axios';

const api = axios.create({
  baseURL: 'http://localhost:5001',
  headers: { 'Content-Type': 'application/json' },
  timeout: 180000,
});

/** Initialise simulation with given parameters, active agents, and per-agent params */
export async function initSimulation(ticker, period, interval, activeAgents = null, agentParams = null) {
  const body = { ticker, period, interval };
  if (activeAgents) body.active_agents = activeAgents;
  if (agentParams) body.agent_params = agentParams;
  const res = await api.post('/api/init', body);
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
