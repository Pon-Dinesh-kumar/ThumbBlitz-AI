

// The use server directive is required for all Genkit flows.
'use server';

/**
 * @fileOverview This file defines a Genkit flow for generating thumbnail images based on a refined prompt and optional inspiration image.
 * 
 * - generateThumbnail - A function that orchestrates the thumbnail generation process.
 * - GenerateThumbnailInput - The input type for the generateThumbnail function.
 * - GenerateThumbnailOutput - The return type for the generateThumbnail function.
 */

import {ai} from '@/ai/genkit';
import {z} from 'genkit';

const MAX_SENTENCE_LENGTH = 70; // Consistent with UI

const GenerateThumbnailInputSchema = z.object({
  improvedPrompt: z.string().describe('The highly descriptive, AI-enhanced or user-provided prompt to use for generating the thumbnail image. This prompt should already be optimized for a 16:9 aspect ratio, high detail, style, visual elements, mood, color, lighting, and composition, potentially derived from an inspiration image and title. It must clearly describe a YOUTUBE THUMBNAIL concept.'),
  inspirationPhotoDataUri: z.string().optional().describe("An optional inspiration thumbnail image as a data URI that must include a MIME type and use Base64 encoding. If provided, this image will heavily guide the visual style of the generated YOUTUBE THUMBNAIL. Expected format: 'data:<mimetype>;base64,<encoded_data>'."),
  inspirationLevel: z.number().min(0).max(100).optional().describe('The desired level of visual influence (0-100%) from the inspirationPhotoDataUri on the generated YOUTUBE THUMBNAIL. Higher values mean closer visual resemblance to the inspiration image in terms of style, color, and composition for a 16:9 aspect ratio, while still respecting the improvedPrompt for content. If undefined and an inspiration image is provided, a default high influence (e.g., 80-100%) will be assumed by the prompt.'),
  useSameFace: z.boolean().optional().describe("If true and an inspiration image with a person is provided, attempt to meticulously replicate the person's facial features and expression in the generated YOUTUBE THUMBNAIL. Defaults to false, where a similar but distinct AI character would be generated."),
  useSameText: z.boolean().optional().describe("If true and an inspiration image with text elements (titles, logos, callouts) is provided, attempt to accurately replicate that text content, style, and approximate placement in the generated YOUTUBE THUMBNAIL. Defaults to false. This is IGNORED if masterTextSentences are provided."),
  primaryColors: z.array(z.string()).optional().describe('Up to four primary colors suggested by the user to be naturally incorporated into the YOUTUBE THUMBNAIL, harmonizing with other visual instructions.'),
  masterTextSentences: z.array(z.string().max(MAX_SENTENCE_LENGTH)).optional().describe(`Up to three sentences of master text. If provided, this text MUST be the ONLY text on the YOUTUBE THUMBNAIL, overriding any text from inspiration images (even if useSameText is true) or from the improvedPrompt. Each sentence has a max length of ${MAX_SENTENCE_LENGTH} characters.`),
});

export type GenerateThumbnailInput = z.infer<typeof GenerateThumbnailInputSchema>;

const GenerateThumbnailOutputSchema = z.object({
  thumbnailDataUri:
    z.string().describe("The generated YOUTUBE THUMBNAIL image (intended for 16:9 aspect ratio) as a data URI that must include a MIME type and use Base64 encoding. Expected format: 'data:<mimetype>;base64,<encoded_data>'."),
});

export type GenerateThumbnailOutput = z.infer<typeof GenerateThumbnailOutputSchema>;

async function retry<T>(
  fn: () => Promise<T>,
  retries: number = 3,
  delay: number = 1000
): Promise<T> {
  try {
    return await fn();
  } catch (err: any) {
    if (retries === 0) {
      console.error(`Final attempt failed for ${fn.name}:`, err);
      throw err;
    }
    console.log(`Retrying ${fn.name} after ${delay}ms. ${retries} retries remaining.`);
    await new Promise(resolve => setTimeout(resolve, delay));
    return retry(fn, retries - 1, delay * 2);
  }
}

export async function generateThumbnail(input: GenerateThumbnailInput): Promise<GenerateThumbnailOutput> {
  return generateThumbnailFlow(input);
}

const generateThumbnailFlow = ai.defineFlow(
  {
    name: 'generateThumbnailFlow',
    inputSchema: GenerateThumbnailInputSchema,
    outputSchema: GenerateThumbnailOutputSchema,
  },
  async (input: GenerateThumbnailInput) => {
    if (!input.improvedPrompt || input.improvedPrompt.trim() === '') {
      throw new Error('Cannot generate thumbnail from an empty or invalid improved prompt. The provided prompt must be descriptive and detailed.');
    }

    const modelToUse = 'googleai/gemini-2.0-flash-exp'; 
    let finalGenerationApiPrompt: any;

    const userRequestedPrefix = "A dynamic 16:9 cinematic thumbnail.";
    const qualityInstruction = "**Visual Quality Requirement: Generate an image with high detail, intricate textures, and a clear, sharp focus, suitable for a high-resolution widescreen (16:9 aspect ratio) display. This is for a YOUTUBE THUMBNAIL. Emphasize cinematic quality.**";
    
    let colorInstruction = "";
    if (input.primaryColors && input.primaryColors.length > 0) {
        colorInstruction = `**Color Suggestions:** If harmonious with the overall scene and other visual instructions (especially any inspiration image style), please try to naturally incorporate these colors: ${input.primaryColors.join(', ')}. These are suggestions; prioritize the main visual concept and inspiration if there's a direct conflict or if the colors clash with the inspiration's established palette when high influence is set.`;
    }

    let masterTextInstruction = "";
    if (input.masterTextSentences && input.masterTextSentences.length > 0) {
        const sentences = input.masterTextSentences.map(s => `'${s.replace(/'/g, "’")}'`).join('; '); // Escape single quotes in sentences
        masterTextInstruction = `**Master Text Requirement (Absolute Priority):** The YOUTUBE THUMBNAIL MUST feature the following text, and ONLY this text: ${sentences}. This text should be prominently and clearly displayed. IGNORE ALL OTHER TEXT sources or instructions, including any text found in an inspiration image (even if 'useSameText' was true for inspiration) or any text described in the 'Core Concept & Content' section below. Arrange this master text in an aesthetically pleasing and highly readable way, suitable for a compelling thumbnail. If multiple sentences are provided, arrange them logically (e.g., main title, subtitle).`;
    }

    let textReplicationInstruction = "";
    if (!masterTextInstruction) { // Only consider inspiration text if no master text
        if (input.useSameText) {
            textReplicationInstruction = `**Text Replication Requirement (from Inspiration Image - Only if NO Master Text is provided):** The inspiration image may contain text elements (titles, logos, callouts). If such text is clearly discernible, you MUST analyze it and accurately replicate its content, style (font appearance, color), and approximate placement within the generated YOUTUBE THUMBNAIL. Integrate this replicated text naturally with the "Core Concept & Content". If no text is clearly discernible or the request is ambiguous, you may interpret text elements from the "Core Concept & Content" prompt. Prioritize replication if text is clearly present in the inspiration.`;
        }
    } else {
        textReplicationInstruction = "**Note on Text:** Master Text is provided and takes absolute precedence. All other text sources (inspiration image, core concept description) will be IGNORED for textual content generation.";
    }
        

    if (input.inspirationPhotoDataUri) {
        let visualGuidanceInstruction = "";
        const level = input.inspirationLevel !== undefined ? input.inspirationLevel : 100; 

        if (level >= 90) {
            visualGuidanceInstruction = `**Visual Style & Inspiration (Level: ${level}% - Strong Adherence):** STRONGLY adhere to the visual style, color palette, composition (framing, angles for a 16:9 widescreen view), lighting, and overall mood of the provided inspiration image. This is your PRIMARY visual guide for the YOUTUBE THUMBNAIL.`;
        } else if (level >= 70) {
            visualGuidanceInstruction = `**Visual Style & Inspiration (Level: ${level}% - High Adherence):** Adhere with HIGH influence to the visual style, color palette, composition (for a 16:9 widescreen view), and lighting of the provided inspiration image for the YOUTUBE THUMBNAIL. Balance this with the core concept.`;
        } else if (level >= 50) {
            visualGuidanceInstruction = `**Visual Style & Inspiration (Level: ${level}% - Balanced Influence):** Draw MODERATE visual inspiration (approximately ${level}%) from the provided inspiration image for style, color, and general composition (suitable for a 16:9 widescreen view) for the YOUTUBE THUMBNAIL. The core concept and other visual details should also significantly shape the image.`;
        } else if (level >= 30) {
            visualGuidanceInstruction = `**Visual Style & Inspiration (Level: ${level}% - Moderate Influence):** Let the provided inspiration image offer some visual cues (approximately ${level}%) for style or mood for the YOUTUBE THUMBNAIL, aiming for a 16:9 widescreen composition. The primary driver for content and most visual aspects should be the core concept described below.`;
        } else { 
            visualGuidanceInstruction = `**Visual Style & Inspiration (Level: ${level}% - Light Influence):** Take LIGHT visual cues (approximately ${level}%) from the inspiration image, perhaps for a subtle mood or minor stylistic element for the YOUTUBE THUMBNAIL, adapting for a 16:9 aspect ratio. The core content and visual details should primarily come from the description below.`;
        }

        let humanSubjectInstruction = `**Important Note on Human Subjects:** If the inspiration image contains a person and your task involves generating a person based on the prompt ("Core Concept & Content"), create an AI-generated individual that aligns with the style and description from the prompt and the specified inspiration level. Do NOT attempt to create an exact photographic replica of the person's face from the inspiration image unless the "Core Concept & Content" explicitly and clearly demands an exact likeness of a specific, named individual. Instead, generate a similar but distinct AI character that fits the scene and its 16:9 widescreen composition for the YOUTUBE THUMBNAIL.`;
        if (input.useSameFace) {
            humanSubjectInstruction = `**Important Note on Human Subjects (Replicate Face):** The inspiration image may contain a person. If a person is clearly discernible, you MUST meticulously replicate their facial features, expression, and likeness as accurately as possible in the generated YOUTUBE THUMBNAIL, while integrating them naturally into the "Core Concept & Content" described below. If no person is clearly discernible or the request is ambiguous, generate a character fitting the prompt's description.`;
        }
        
        const generationText = `${userRequestedPrefix} ${qualityInstruction}
        ${masterTextInstruction ? masterTextInstruction + "\n" : ""}
        ${colorInstruction}
        Task: Generate a YOUTUBE THUMBNAIL based on the following.
        ${visualGuidanceInstruction}
        ${textReplicationInstruction}
        **Core Concept & Content (Visuals Only if Master Text is Present):** Realize the following detailed scene: "${input.improvedPrompt}". Ensure this concept is clearly depicted within a 16:9 aspect ratio, balanced with the visual inspiration as per the level specified. The textual description from "Core Concept & Content" defines WHAT to create for the YOUTUBE THUMBNAIL, while the inspiration image and level guide HOW IT LOOKS. ${masterTextInstruction ? "Any text described in this 'Core Concept & Content' section must be IGNORED; use ONLY the Master Text specified above." : ""}
        ${humanSubjectInstruction}
        The final image must be distinct and original, ${input.useSameFace || (input.useSameText && !masterTextInstruction) ? "except for specifically requested replications of facial features or text elements if \`useSameFace\` or \`useSameText\` (and no master text) were indicated. Otherwise," : ""} not a direct copy or minor variation of the inspiration image, but clearly drawing from its artistic essence (to the degree specified by the inspiration level) to depict the core concept from the prompt for the YOUTUBE THUMBNAIL.
        Emphasize a cinematic quality, vibrant (or mood-appropriate) colors (considering user suggestions if provided and harmonious), sharp details, and professional quality suitable for a compelling YOUTUBE THUMBNAIL designed for a 16:9 widescreen display.
        **Final Reminder: The output image should have a 16:9 aspect ratio, be highly detailed, and suitable for a YOUTUBE THUMBNAIL.**`;
        
        finalGenerationApiPrompt = [
            { media: { url: input.inspirationPhotoDataUri } },
            { text: generationText },
        ];
    } else {
        const generationText = `${userRequestedPrefix} ${qualityInstruction}
        ${masterTextInstruction ? masterTextInstruction + "\n" : ""}
        ${colorInstruction}
        Task: Generate a YOUTUBE THUMBNAIL based on the following highly descriptive prompt, aiming for a 16:9 aspect ratio and high detail: "${input.improvedPrompt}".
        ${masterTextInstruction ? "Any text described in the prompt above (Core Concept & Content) must be IGNORED; use ONLY the Master Text specified." : ""}
        Focus on vibrant (or mood-appropriate) colors (considering user suggestions if provided and harmonious), sharp details, excellent lighting, and strong composition to create an engaging YOUTUBE THUMBNAIL suitable for a widescreen (16:9) display.
        **Final Reminder: The output image should have a 16:9 aspect ratio, be highly detailed, and suitable for a YOUTUBE THUMBNAIL.**`;
        finalGenerationApiPrompt = generationText;
    }
    
    const {media} = await retry(() => ai.generate({
      model: modelToUse, 
      prompt: finalGenerationApiPrompt,
      config: {
        responseModalities: ['TEXT', 'IMAGE'], 
        safetySettings: [
          { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_ONLY_HIGH' },
          { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_NONE' },
          { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
          { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_MEDIUM_AND_ABOVE' }, 
        ],
      },
    }), 3, 1000);

    if (!media?.url) {
      console.error('Image generation failed. Media object:', media, 'Input prompt used for generation:', input.improvedPrompt, 'Inspiration URI present:', !!input.inspirationPhotoDataUri, 'Final API prompt structure:', finalGenerationApiPrompt);
      throw new Error('Image generation failed or did not return a valid image URL. The AI model may have refused the request due to safety filters, the prompt might be too complex/unclear, or an unexpected error occurred with the generation service. Please try refining your title/prompt or using a different inspiration image.');
    }

    return {thumbnailDataUri: media.url};
  }
);


    