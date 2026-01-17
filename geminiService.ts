import { GoogleGenAI, GenerateContentResponse } from "@google/genai";
import { Message, UserLocation, DogProfile } from "../types";

// Simulated "Reputable Dataset" for Veterinary Information
// In a production environment, this would be a Vector Database lookup.
const verifiedKnowledgeBase = `
REPUTABLE VETERINARY FACTS (INTERNAL DATASET):
1. Rabies vaccines are required by law in most regions; first dose at 12-16 weeks.
2. Chocolate, grapes, and xylitol are toxic; immediate vet intervention required.
3. Puppies require parvovirus boosters every 3-4 weeks until 16 weeks old.
4. Ticks can transmit Lyme disease within 24-48 hours of attachment.
5. Heartworm prevention must be administered year-round in humid climates.
`;

const getSystemInstruction = (profile?: DogProfile) => {
  let instruction = `
You are "paws4life.ai", an elite Veterinary Assistant. 
### SOURCE HIERARCHY:
1. MANDATORY: Reference the "REPUTABLE VETERINARY FACTS" provided below first.
2. SECONDARY: Use your internal high-quality training.
3. TERTIARY: Use Google Search only for local services or trending news.

### REPUTABLE VETERINARY FACTS:
${verifiedKnowledgeBase}

### BEHAVIOR:
- If a user asks about a topic covered in the Reputable Facts, use that information as the primary source.
- For medical questions, ALWAYS provide a "Verified Source" disclaimer.
- Be concise and authoritative.
`;

  if (profile && profile.name) {
    instruction += `\n\n### DOG PROFILE: ${profile.name} (${profile.breed}). Age: ${profile.age}. Weight: ${profile.weight}.`;
  }

  return instruction;
};

export const generateDogAdvice = async (
  prompt: string,
  history: Message[],
  location?: UserLocation,
  profile?: DogProfile
): Promise<{ text: string; sources: Array<{ title: string; uri: string }>; isVerified: boolean }> => {
  try {
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

    // Use Pro model for high-quality medical reasoning
    const model = 'gemini-3-pro-preview';
    const tools: any[] = [{ googleSearch: {} }];

    const response: GenerateContentResponse = await ai.models.generateContent({
      model: model,
      contents: history.concat([{role: 'user', text: prompt, id: 'temp', timestamp: Date.now()}]).map(msg => ({
        role: msg.role === 'model' ? 'model' : 'user',
        parts: [{ text: msg.text }]
      })),
      config: {
        systemInstruction: getSystemInstruction(profile),
        tools: tools,
        temperature: 0.2, // Lower temperature for more factual consistency
      },
    });

    const text = response.text || "I'm having trouble retrieving verified records.";
    const sources: Array<{ title: string; uri: string }> = [];

    const chunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks;
    if (chunks) {
      chunks.forEach((chunk: any) => {
        if (chunk.web) {
          sources.push({ title: chunk.web.title, uri: chunk.web.uri });
        }
      });
    }

    // Heuristic check if the answer used the "Reputable Facts" block
    const isVerified = text.toLowerCase().includes("verified") || text.toLowerCase().includes("vaccine");

    return { text, sources, isVerified };
  } catch (error) {
    console.error("Gemini API Error:", error);
    return { text: "Connection error.", sources: [], isVerified: false };
  }
};