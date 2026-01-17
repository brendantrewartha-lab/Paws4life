import { GoogleGenAI, GenerateContentResponse } from "@google/genai";
import { Message, UserLocation, DogProfile } from "../types";

const getSystemInstruction = (profile?: DogProfile) => {
  let instruction = `
You are "paws4life.ai", a specialized veterinary assistant and dog care expert. 
Your knowledge is based on authoritative veterinary textbooks, breed standards, and real-time public pet data.
- Always prioritize dog health and safety.
- For medical emergencies, strongly advise immediate veterinary consultation.
- Provide detailed breed-specific advice (diet, exercise, common health issues).
- Use local data to suggest dog-friendly parks, clinics, and services.
- Be friendly, encouraging, and knowledgeable.
- Use Markdown for formatting (bolding, lists, etc.).
- When suggesting products, be objective but acknowledge sponsored partners if relevant.
`;

  if (profile && profile.name) {
    instruction += `\n\nUSER'S DOG CONTEXT:
The user has a dog named ${profile.name}.
Breed: ${profile.breed || 'Unknown'}
Age: ${profile.age || 'Unknown'}
Weight: ${profile.weight || 'Unknown'}
Allergies: ${profile.allergies || 'None listed'}
Medical Conditions: ${profile.conditions || 'None listed'}
Home Location: ${profile.homeLocation || 'Not specified'}

Always keep these specific details in mind when giving advice. Use the Home Location if the user asks for services near their house, even if their current GPS location is different.`;
  }

  return instruction;
};

export const generateDogAdvice = async (
  prompt: string,
  history: Message[],
  location?: UserLocation,
  profile?: DogProfile
): Promise<{ text: string; sources: Array<{ title: string; uri: string }> }> => {
  try {
    // Create new AI instance locally to ensure current API Key is used
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

    // Maps grounding is only supported in Gemini 2.5 series models.
    const tools: any[] = [{ googleSearch: {} }];
    const model = location ? 'gemini-2.5-flash' : 'gemini-3-flash-preview';

    if (location) {
      tools.push({ googleMaps: {} });
    }

    const response: GenerateContentResponse = await ai.models.generateContent({
      model: model,
      contents: history.concat([{role: 'user', text: prompt, id: 'temp', timestamp: Date.now()}]).map(msg => ({
        role: msg.role === 'model' ? 'model' : 'user',
        parts: [{ text: msg.text }]
      })),
      config: {
        systemInstruction: getSystemInstruction(profile),
        tools: tools,
        toolConfig: location ? {
          retrievalConfig: {
            latLng: {
              latitude: location.latitude,
              longitude: location.longitude
            }
          }
        } : undefined
      },
    });

    const text = response.text || "I'm sorry, I couldn't process that request.";
    const sources: Array<{ title: string; uri: string }> = [];

    const chunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks;
    if (chunks) {
      chunks.forEach((chunk: any) => {
        if (chunk.web) {
          sources.push({ title: chunk.web.title, uri: chunk.web.uri });
        } else if (chunk.maps) {
          sources.push({ title: chunk.maps.title, uri: chunk.maps.uri });
        }
      });
    }

    return { text, sources };
  } catch (error) {
    console.error("Gemini API Error:", error);
    return { 
      text: "I encountered an error connecting to my knowledge base. Please try again.", 
      sources: [] 
    };
  }
};