// Client API client for communicating with Storyteller backend server

export async function fetchWorlds() {
  const res = await fetch('/api/worlds');
  if (!res.ok) throw new Error('Failed to fetch worlds');
  return await res.json();
}

export async function fetchWorld(id) {
  const res = await fetch(`/api/worlds/${id}`);
  if (!res.ok) throw new Error(`Failed to fetch world ${id}`);
  return await res.json();
}

export async function createWorld(worldData) {
  const res = await fetch('/api/worlds', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(worldData),
  });
  if (!res.ok) throw new Error('Failed to create world');
  return await res.json();
}

export async function updateWorld(id, worldData) {
  const res = await fetch(`/api/worlds/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(worldData),
  });
  if (!res.ok) throw new Error(`Failed to update world ${id}`);
  return await res.json();
}

export async function deleteWorld(id) {
  const res = await fetch(`/api/worlds/${id}`, {
    method: 'DELETE',
  });
  if (!res.ok) throw new Error(`Failed to delete world ${id}`);
  return await res.json();
}

export async function fetchCampaigns() {
  const res = await fetch('/api/campaigns');
  if (!res.ok) throw new Error('Failed to fetch campaigns');
  return await res.json();
}

export async function fetchCampaign(id) {
  const res = await fetch(`/api/campaigns/${id}`);
  if (!res.ok) throw new Error(`Failed to fetch campaign ${id}`);
  return await res.json();
}

export async function createCampaign(campaignData) {
  const res = await fetch('/api/campaigns', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(campaignData),
  });
  if (!res.ok) throw new Error('Failed to create campaign');
  return await res.json();
}

export async function updateCampaign(id, campaignData) {
  const res = await fetch(`/api/campaigns/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(campaignData),
  });
  if (!res.ok) throw new Error(`Failed to update campaign ${id}`);
  return await res.json();
}

export async function deleteCampaign(id) {
  const res = await fetch(`/api/campaigns/${id}`, {
    method: 'DELETE',
  });
  if (!res.ok) throw new Error(`Failed to delete campaign ${id}`);
  return await res.json();
}

export async function checkOllamaStatus(host = 'http://localhost:11434') {
  try {
    const res = await fetch(`/api/ollama/status?host=${encodeURIComponent(host)}`);
    if (!res.ok) return { online: false, models: [] };
    return await res.json();
  } catch (err) {
    return { online: false, error: err.message, models: [] };
  }
}
