import { GoogleGenAI, Type } from "@google/genai";
import { InterviewConfig, TranscriptItem, FeedbackAnalysis } from '../types';

export async function generateFeedback(
  config: InterviewConfig,
  transcript: TranscriptItem[]
): Promise<FeedbackAnalysis> {
  const apiKey = process.env.API_KEY;
  if (!apiKey) throw new Error("API Key not found");

  const ai = new GoogleGenAI({ apiKey });

  // Filter out empty turns and format transcript for the prompt
  const conversationText = transcript
    .map(t => `${t.role.toUpperCase()}: ${t.text}`)
    .join('\n');

  const prompt = `
    You are an expert technical interviewer and hiring manager.
    Evaluate the following interview for a candidate applying for:
    Role: ${config.targetRole}
    Level: ${config.experienceLevel}
    Company Type: ${config.companyType}

    Transcript:
    ${conversationText}

    Provide a structured evaluation in JSON format including:
    1. A score out of 100 based on technical accuracy, communication, and role fit.
    2. A brief summary (max 3 sentences).
    3. 3 key strengths.
    4. 3 specific areas for improvement.
  `;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
      config: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            score: { type: Type.INTEGER },
            summary: { type: Type.STRING },
            strengths: { 
              type: Type.ARRAY, 
              items: { type: Type.STRING } 
            },
            improvements: { 
              type: Type.ARRAY, 
              items: { type: Type.STRING } 
            }
          },
          required: ["score", "summary", "strengths", "improvements"]
        }
      }
    });

    const jsonText = response.text;
    if (!jsonText) throw new Error("No response received from feedback model");
    
    return JSON.parse(jsonText) as FeedbackAnalysis;
  } catch (error) {
    console.error("Error generating feedback:", error);
    // Return a fallback error state if generation fails
    return {
      score: 0,
      summary: "Could not generate feedback due to an error. Please try again.",
      strengths: [],
      improvements: []
    };
  }
}