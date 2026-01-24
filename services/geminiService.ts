
import { GoogleGenAI } from "@google/genai";

export async function getBattleCommentary(playerHP: number, aiHP: number, hitAccuracy: number): Promise<string> {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const model = 'gemini-3-flash-preview';

  const prompt = `
    You are a hype announcer for a fighting game called 'Vocal Combat'. 
    The player fights by singing the correct pitches.
    Current Game State:
    - Player HP: ${playerHP}/100
    - Opponent HP: ${aiHP}/100
    - Recent Accuracy: ${Math.round(hitAccuracy * 100)}%

    Provide a very short, energetic, and slightly trash-talking or encouraging line (max 15 words) that 
    the announcer would say right now. If the player is doing well, praise their "perfect pitch".
    If they are losing, roast their "flat notes".
  `;

  try {
    const response = await ai.models.generateContent({
      model,
      contents: prompt,
      config: {
        thinkingConfig: { thinkingBudget: 0 }
      }
    });
    return response.text || "KEEP SINGING! DON'T DROP THE BEAT!";
  } catch (error) {
    console.error("Gemini Commentary Error:", error);
    return "THE CROWD IS GOING WILD!";
  }
}
