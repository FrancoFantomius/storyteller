// Ollama Inference and Dynamic Storyteller Engine
import { getSettings } from './storage.js';

/**
 * Builds the AI system prompt with world lore, logic rules, character data and storytelling guidelines
 */
export function buildSystemPrompt(world, activeCharacter) {
  const settings = getSettings();
  const logicRules = (world.logic || []).map((rule, idx) => `${idx + 1}. ${rule}`).join('\n');
  const npcs = (world.characters || [])
    .filter(c => c.type === 'npc')
    .map(npc => `- ${npc.name} (${npc.role}, Faction: ${npc.faction || 'None'}): ${npc.bio || ''} [Secret: ${npc.secret || 'None'}]`)
    .join('\n');

  return `You are the master Narrator of an interactive choose-your-own-adventure story set in "${world.name}".
Genre: ${world.genre || 'Adventure'}
Narrative Tone: ${world.tone || settings.narrativeTone || 'Rich and immersive'}

WORLD SETTING & LORE:
${world.setting || world.description || 'A mysterious realm.'}

IMMUTABLE WORLD LOGIC RULES (You must strictly obey these rules without exception):
${logicRules || 'None specified.'}

KEY NPCS IN THIS WORLD:
${npcs || 'None specified.'}

ACTIVE PLAYER CHARACTER:
Name: ${activeCharacter.name}
Role/Archetype: ${activeCharacter.role || 'Adventurer'}
Bio: ${activeCharacter.bio || ''}
Equipment: ${(activeCharacter.equipment || []).join(', ')}

INSTRUCTIONS FOR STORYTELLING:
1. Deliver vivid, atmospheric, second-person narrative ("You...").
2. Respect player freedom completely—the player can attempt anything, say anything, or direct how the world changes.
3. React realistically according to the World Logic Rules and the active character's context.
4. End every narrative response with high engagement, presenting dramatic consequences or open opportunities.
5. Provide 3 or 4 clear, compelling suggested next actions formatted at the very end under "**Suggestions:**" as numbered lines without any emojis.`;
}

/**
 * Generates next story turn using Ollama streaming or intelligent simulation fallback
 */
export async function generateStoryTurn({ world, campaign, userInput, activeCharacter, onToken }) {
  const settings = getSettings();
  const systemPrompt = buildSystemPrompt(world, activeCharacter);

  const formattedUserPrompt = `${userInput.trim()}\n\nContinue the narrative based on this input. Describe what happens next.`;

  let ollamaWorked = false;
  let fullGeneratedText = '';

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12000);

    const historyMessages = (campaign.history || []).slice(-8).map(h => {
      if (h.type === 'narrative') {
        return { role: 'assistant', content: h.text };
      } else {
        return { role: 'user', content: h.text };
      }
    });

    const messages = [
      { role: 'system', content: systemPrompt },
      ...historyMessages,
      { role: 'user', content: formattedUserPrompt },
    ];

    const res = await fetch(`${settings.ollamaHost}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: settings.ollamaModel || 'llama3:latest',
        messages: messages,
        stream: true,
        options: {
          temperature: settings.temperature || 0.7,
          top_p: settings.topP || 0.9,
          num_ctx: settings.contextSize || 4096,
        },
      }),
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (res.ok && res.body) {
      const reader = res.body.getReader();
      const decoder = new TextDecoder();

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split('\n').filter(Boolean);
        for (const line of lines) {
          try {
            const parsed = JSON.parse(line);
            if (parsed.message && parsed.message.content) {
              fullGeneratedText += parsed.message.content;
              if (onToken) onToken(parsed.message.content, fullGeneratedText);
            }
          } catch (e) {
            // Ignore partial json chunks
          }
        }
      }

      if (fullGeneratedText.trim().length > 10) {
        ollamaWorked = true;
      }
    }
  } catch (err) {
    console.warn('Ollama connection unavailable or timed out. Using fallback engine.', err);
  }

  if (!ollamaWorked) {
    fullGeneratedText = simulateStoryContinuation(world, activeCharacter, userInput, campaign);
    if (onToken) {
      onToken(fullGeneratedText, fullGeneratedText);
    }
  }

  const suggestedActions = extractSuggestions(fullGeneratedText, world, userInput);
  const cleanNarrativeText = cleanSuggestionsFromText(fullGeneratedText);

  return {
    narrativeText: cleanNarrativeText,
    suggestedActions,
    mood: inferSceneMood(cleanNarrativeText),
  };
}

function simulateStoryContinuation(world, character, input, campaign) {
  const worldName = world.name || 'this realm';
  const genre = (world.genre || '').toLowerCase();

  const consequence = `Responding to your intent, ${input.trim()}. The atmosphere shifts immediately as the consequences unfold across the scene.`;

  let atmosphere = '';
  if (genre.includes('cyber')) {
    atmosphere = `Holographic advertisements flicker in the damp haze overhead. The distant hum of magnetic transit lines underscores the tense quiet.`;
  } else if (genre.includes('horror') || genre.includes('eldritch')) {
    atmosphere = `A cold draft sweeps through the space, carrying a faint scent of ozone and forgotten stone. Shadows lengthen along the edges of the light.`;
  } else if (genre.includes('space') || genre.includes('sci-fi')) {
    atmosphere = `The steady hum of life support systems resonates through the deckplates. Through the viewport, distant star clusters glow softly against the void.`;
  } else {
    atmosphere = `A gentle resonance hums through the crystalline leylines in the stonework. High above, archipelagos float against the clear sky like silent sentinels.`;
  }

  const complication = `A new detail comes into focus, revealing an unexpected opportunity to investigate or press forward.`;

  const result = `${consequence}

${atmosphere}

${complication}

**Suggestions:**
1. Examine the immediate surroundings for hidden details.
2. Formulate a response utilizing your ${character.equipment?.[0] || 'gear'}.
3. Speak with any nearby observers or companions.
4. Advance further along the primary pathway.`;

  return result;
}

export async function generateWorldFromPrompt(prompt) {
  const settings = getSettings();
  let generatedData = null;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12000);

    const systemPrompt = `You are a worldbuilding AI. The user will provide a brief concept. Output a complete JSON object representing an interactive storytelling world with the following structure:
{
  "name": "World Name",
  "genre": "Genre string",
  "tone": "Tone description",
  "description": "Short pitch description",
  "coverColor": "#HEXCODE",
  "coverIcon": "material-symbols-icon-name",
  "setting": "Detailed background lore, geography, factions and atmosphere",
  "logic": [
    "Specific rule 1 for the AI to remember",
    "Specific rule 2",
    "Specific rule 3",
    "Specific rule 4"
  ],
  "characters": [
    {
      "id": "char_1",
      "name": "Character Name",
      "type": "playable",
      "role": "Class or Role",
      "bio": "Character background story",
      "stats": { "Strength": 15, "Agility": 14, "Intelligence": 12, "Charisma": 13, "Willpower": 14 },
      "equipment": ["Item 1", "Item 2", "Item 3"]
    },
    {
      "id": "char_2",
      "name": "Second Playable Character",
      "type": "playable",
      "role": "Class or Role",
      "bio": "Character background",
      "stats": { "Strength": 10, "Agility": 16, "Intelligence": 17, "Charisma": 12, "Willpower": 15 },
      "equipment": ["Item 1", "Item 2"]
    },
    {
      "id": "char_npc_1",
      "name": "Major NPC Name",
      "type": "npc",
      "role": "NPC Role",
      "bio": "NPC description and role in the world",
      "faction": "Faction name",
      "secret": "A key secret this NPC harbors"
    }
  ],
  "scenarios": [
    {
      "id": "scen_1",
      "title": "First Scenario Hook Title",
      "description": "Engaging scenario hook description",
      "starterAction": "First action the player can take"
    },
    {
      "id": "scen_2",
      "title": "Second Scenario Hook Title",
      "description": "Alternative scenario hook description",
      "starterAction": "Opening action"
    }
  ]
}
Return ONLY valid JSON without markdown wrapping.`;

    const res = await fetch(`${settings.ollamaHost}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: settings.ollamaModel || 'llama3:latest',
        system: systemPrompt,
        prompt: `Create a rich world from this concept: "${prompt}"`,
        stream: false,
        format: 'json',
      }),
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (res.ok) {
      const data = await res.json();
      if (data.response) {
        generatedData = JSON.parse(data.response);
      }
    }
  } catch (err) {
    console.warn('Ollama unavailable for world generation, using smart procedural worldbuilder.', err);
  }

  if (!generatedData) {
    generatedData = synthesizeWorld(prompt);
  }

  return generatedData;
}

function synthesizeWorld(prompt) {
  const p = prompt.trim();
  const lower = p.toLowerCase();

  let genre = 'High Fantasy & Adventure';
  let color = '#6750A4';
  let icon = 'fort';
  let tone = 'Epic, dangerous, and rich in mysteries';

  if (lower.includes('cyber') || lower.includes('neon') || lower.includes('matrix') || lower.includes('hack')) {
    genre = 'Cyberpunk & Sci-Fi Noir';
    color = '#006A6A';
    icon = 'memory';
    tone = 'Gritty, high-stakes, dystopian, and neon-lit';
  } else if (lower.includes('space') || lower.includes('star') || lower.includes('planet') || lower.includes('alien')) {
    genre = 'Space Opera & Hard Sci-Fi';
    color = '#1E40AF';
    icon = 'rocket_launch';
    tone = 'Expansive, awe-inspiring, and technologically complex';
  } else if (lower.includes('horror') || lower.includes('dark') || lower.includes('zombie') || lower.includes('vampire')) {
    genre = 'Gothic & Cosmic Horror';
    color = '#4A0404';
    icon = 'skull';
    tone = 'Tense, psychological, eerie, and atmospheric';
  }

  const capitalizedTitle = p.length < 40 ? p : p.split(' ').slice(0, 5).join(' ');

  return {
    name: `The Chronicles of ${capitalizedTitle.replace(/^(a|an|the)\s+/i, '')}`,
    genre: genre,
    tone: tone,
    description: p,
    coverColor: color,
    coverIcon: icon,
    setting: `${p}\n\nThis universe is characterized by deep factions vying for dominance, forgotten relics buried beneath ancient strata, and an evolving geopolitical climate where single individuals can alter the course of history.`,
    logic: [
      `Actions have realistic physical and political consequences across all factions.`,
      `Ancient technologies and esoteric powers cannot be wielded without proper attunement.`,
      `Information and trust are scarce commodities; alliances shift based on leverage.`,
      `Environmental hazards require specialized gear or risk severe debilitation.`,
    ],
    characters: [
      {
        id: 'char_gen_1',
        name: 'Vaelen Drake',
        type: 'playable',
        role: 'Vanguard Pathfinder',
        bio: `A skilled explorer and tactician who has survived on the fringes of civilization.`,
        stats: { Strength: 15, Agility: 16, Intelligence: 13, Charisma: 12, Willpower: 14 },
        equipment: ['Reinforced Survival Duster', 'Precision Sidearm', 'Multi-Spectrum Scanner', 'Field Medkit'],
      },
      {
        id: 'char_gen_2',
        name: 'Lyra Solis',
        type: 'playable',
        role: 'Specialist',
        bio: `A sharp-witted researcher driven by an obsession to decode the origins of the world's deepest anomalies.`,
        stats: { Strength: 9, Agility: 14, Intelligence: 18, Charisma: 14, Willpower: 15 },
        equipment: ['Encrypted Codex Device', 'Focus Prism', 'Concealed Blade', 'Energy Capsule'],
      },
      {
        id: 'char_npc_1',
        name: 'Overseer Kaelen Vane',
        type: 'npc',
        role: 'High Magistrate',
        bio: 'The enigmatic authority governing the regional trade hubs with an iron grip.',
        faction: 'The Central Directorate',
        secret: 'Secretly funding insurgent factions to maintain a state of controlled conflict.',
      },
    ],
    scenarios: [
      {
        id: 'scen_gen_1',
        title: 'The Catalyst Anomaly',
        description: `A sudden surge of energy erupts from the sector border. You are the first to arrive at the impact crater before official quarantine teams lock down the perimeter.`,
        starterAction: 'Inspect the glowing fissure and analyze the surrounding readings.',
      },
    ],
  };
}

function extractSuggestions(text, world, userInput) {
  const suggestions = [];
  const lines = text.split('\n');

  for (const line of lines) {
    const match = line.match(/^(\d+\.|\-|\*)\s+(.+)$/);
    if (match && match[2].length > 5 && match[2].length < 120) {
      const clean = match[2].replace(/\*\*/g, '').replace(/\[|\]/g, '').trim();
      // Remove any emojis
      const noEmoji = clean.replace(/[\u{1F300}-\u{1F9FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]/gu, '').trim();
      if (!noEmoji.toLowerCase().includes('suggestion') && suggestions.length < 4 && noEmoji.length > 5) {
        suggestions.push(noEmoji);
      }
    }
  }

  if (suggestions.length < 3) {
    return [
      'Examine the immediate surroundings for hidden details',
      'Speak to any nearby characters to glean information',
      'Prepare your gear and proceed with caution',
      'Investigate the anomalies in the distance',
    ];
  }

  return suggestions;
}

function cleanSuggestionsFromText(text) {
  const splitIdx = text.search(/(\*\*Suggestions:\*\*|Suggestions:|Suggested Options:|\*\*Suggested Actions:\*\*|Suggested Actions:)/i);
  if (splitIdx !== -1) {
    return text.substring(0, splitIdx).trim();
  }
  return text.trim();
}

function inferSceneMood(text) {
  const t = text.toLowerCase();
  if (t.includes('danger') || t.includes('threat') || t.includes('blood') || t.includes('alarm')) {
    return 'danger';
  }
  if (t.includes('shadow') || t.includes('mist') || t.includes('ancient') || t.includes('relic')) {
    return 'mysterious';
  }
  if (t.includes('neon') || t.includes('laser') || t.includes('engine') || t.includes('drone')) {
    return 'cyber';
  }
  return 'adventure';
}
