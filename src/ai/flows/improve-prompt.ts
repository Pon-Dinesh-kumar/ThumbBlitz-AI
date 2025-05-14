'use server';

/**
 * @fileOverview A prompt improver AI agent.
 * 
 * - improvePrompt - A function that handles the prompt improvement process.
 * - ImprovePromptInput - The input type for the improvePrompt function.
 * - ImprovePromptOutput - The return type for the improvePrompt function.
 */

import {ai} from '@/ai/genkit';
import {z} from 'genkit';

const MAX_SENTENCE_LENGTH = 70; // Consistent with UI

const ImprovePromptInputSchema = z.object({
  title: z.string().optional().describe('The title of the content for which the YOUTUBE THUMBNAIL is being generated.'),
  prompt: z.string().optional().describe('The initial user prompt for the YOUTUBE THUMBNAIL. This will be ignored if inspirationPhotoDataUri is provided, in which case a new prompt is generated from the image and title.'),
  inspirationPhotoDataUri: z.string().optional().describe("An optional inspiration image as a data URI. If provided, a new prompt will be generated based on this image and the title, specifically for a YOUTUBE THUMBNAIL. Expected format: 'data:<mimetype>;base64,<encoded_data>'."),
  primaryColors: z.array(z.string()).optional().describe('Up to four primary colors suggested by the user to be naturally incorporated into the YOUTUBE THUMBNAIL.'),
  masterTextSentences: z.array(z.string().max(MAX_SENTENCE_LENGTH)).optional().describe(`Up to three sentences of master text. If provided, this text MUST be the ONLY text on the YOUTUBE THUMBNAIL, overriding any other text instructions or text from inspiration images. Each sentence has a max length of ${MAX_SENTENCE_LENGTH} characters.`),
});
export type ImprovePromptInput = z.infer<typeof ImprovePromptInputSchema>;

const ImprovePromptOutputSchema = z.object({
  improvedPrompt: z.string().describe('The improved or generated prompt for creating a better YOUTUBE THUMBNAIL. This prompt must be highly descriptive, ALWAYS starting with "A dynamic 16:9 cinematic thumbnail." and following a structured format including: Subject & Scene, Overlays (if any, especially master text), Human Element (if any), Color Palette, Lighting, Composition, Thematic Integration (of Title), and Artistic Style. It must focus on visual elements, high detail, and a widescreen (16:9) aspect ratio suitable for an image generation model to produce a compelling YOUTUBE THUMBNAIL. If master text is provided, it dictates the "Overlays" and no other text should be described or implied for generation.'),
});
export type ImprovePromptOutput = z.infer<typeof ImprovePromptOutputSchema>;

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

export async function improvePrompt(input: ImprovePromptInput): Promise<ImprovePromptOutput> {
  return improvePromptFlow(input);
}

const prompt = ai.definePrompt({
  name: 'improvePromptPrompt',
  input: {schema: ImprovePromptInputSchema}, // Schema for the data passed to prompt()
  output: {schema: ImprovePromptOutputSchema},
  prompt: `You are an AI expert specializing in crafting and improving prompts for image generation, specifically targeting compelling **YOUTUBE THUMBNAILS with a 16:9 aspect ratio and high visual detail**.
Your goal is to produce a single, highly descriptive, visually evocative textual prompt suitable for an image generation model. The output prompt **MUST ALWAYS** start with "A dynamic 16:9 cinematic thumbnail." and follow a structured, detailed format.

**Reference Prompt Structure & Example:**
Your output prompt should resemble this structure and level of detail:
"A dynamic 16:9 cinematic thumbnail.
Subject & Scene: [e.g., A cutting-edge stealth fighter jet soars through a vibrant sky filled with puffy, cartoon-like clouds, hinting at a game environment.]
{{#if masterTextSentences.length}}
Overlays: The following text MUST be prominently displayed and be the ONLY text on the thumbnail: {{#each masterTextSentences}}'{{{this}}}'{{#unless @last}}; {{/unless}}{{/each}}. Arrange attractively. No other text from any source (inspiration image, title analysis, or general description) should be present.
{{else}}
Overlays: [e.g., In the top-left corner, overlay a stylized PlayStation logo with a '+99' notification badge. Overlay a bright yellow text box with the words 'No Coding'. If no overlays are described from inspiration or prompt, state 'Overlays: None.']
{{/if}}
Human Element (if any): [e.g., To the right, a smiling, confident South Asian man partially fills the frame, looking directly at the viewer. Describe ethnicity, gender, approximate age, expression, hair, clothing, and pose. If no human element, state 'Human Element: None.']
{{#if primaryColors.length}}
Color Palette: The scene should naturally incorporate these primary colors: {{#each primaryColors}}{{{this}}}{{#unless @last}}, {{/unless}}{{/each}}. For the rest of the palette, consider [describe typical palette or one derived from title/context, e.g., vibrant and contrasting, or moody and dark, ensuring it complements the suggested primary colors].
{{else}}
Color Palette: [e.g., The overall color palette is bright and optimistic, using blues, whites, and yellows, or describe a palette suitable for the title/prompt.]
{{/if}}
Lighting: [e.g., Lighting is bright and diffused, simulating daylight.]
Composition: [e.g., The composition balances the technological and human elements, ensuring a 16:9 aspect ratio, possibly using rule of thirds or leading lines for a widescreen view.]
Thematic Integration (of Title): [e.g., This scene visually hints at the possibilities of '{{{title}}}'.]
Artistic Style: [e.g., The style is a modern blend of photorealism and digital illustration, creating a sense of excitement and accessibility. Aim for high detail, intricate textures, and sharp focus.]
Ensure high detail, intricate textures, sharp focus, and suitability for a high-resolution widescreen (16:9) YouTube thumbnail. Emphasize cinematic quality."

Read the following inputs carefully:
{{#if title}}
Content Title: "{{{title}}}" (This is for a YOUTUBE THUMBNAIL)
{{/if}}
{{#if primaryColors.length}}
User Suggested Primary Colors: {{#each primaryColors}}{{{this}}}{{#unless @last}}, {{/unless}}{{/each}}. These should be naturally integrated.
{{/if}}
{{#if masterTextSentences.length}}
{{{masterTextInstructionForLLM}}}
{{/if}}

{{#if inspirationPhotoDataUri}}
An inspiration image (likely a YOUTUBE THUMBNAIL itself) has been provided. You are an AI image analyst. Your crucial task is to create a highly detailed textual prompt based on the **Reference Prompt Structure & Example** above. This prompt will be used by a separate AI image generation model that **cannot see the original inspiration image**. Therefore, your textual prompt must meticulously describe the visual elements, style, and essence of the inspiration image, translating them into the structured format, enabling the other AI to generate a new YOUTUBE THUMBNAIL that is visually very similar, with **high detail and a 16:9 aspect ratio**.

Your generated textual prompt must:
1.  **Start with:** "A dynamic 16:9 cinematic thumbnail."
2.  **Deep Image Analysis & Structured Textual Translation:**
    *   Thoroughly analyze the \`Inspiration Image\` (provided below) for its core visual characteristics: overall scene/subject, artistic style, observed color palette, lighting, composition (elements suggesting a wide 16:9 view), mood, key textures/details.
    *   **For Human Elements:** Pay extremely close attention to any human faces if present. Describe their apparent ethnicity, gender, age range, hair style/color, facial expression, clothing, and pose in detail in the "Human Element" section. If no human element is clearly discernible, state 'Human Element: None.'.
    *   **For Text & Overlays (If NO Master Text is provided):** Meticulously identify and describe any visible text, logos, or graphic overlays from the inspiration image. Detail their content, apparent font style, color, size, and approximate placement in the "Overlays" section. If no text/overlays are clearly discernible, state 'Overlays: None.'.
    *   **If Master Text IS provided:** The "Overlays" section MUST be dictated by the \`masterTextSentences\` as shown in the Reference Prompt Structure. Any text in the inspiration image must be IGNORED.
    *   Translate these visual observations into the **Reference Prompt Structure**, filling in each section.
    *   For the "Color Palette" section: First, describe the dominant colors and mood from the inspiration image. Then, if user-suggested \`primaryColors\` are provided ({{#if primaryColors.length}}{{#each primaryColors}}{{{this}}}{{#unless @last}}, {{/unless}}{{/each}}{{else}}none provided{{/if}}), state how they could be naturally blended or if the inspiration's palette should be prioritized if they conflict strongly. The goal is a harmonious result reflecting the inspiration's style.
3.  **Title Integration:**
    *   Creatively and seamlessly weave the theme of the \`Content Title\` ({{#if title}}"{{{title}}}"{{else}}no title provided{{/if}}) into the "Thematic Integration (of Title)" section and ensure other sections like "Subject & Scene" also reflect the title's essence.
4.  **Output Goal:**
    *   The final output must be a single, coherent paragraph that strictly follows the **Reference Prompt Structure**. It must be extremely descriptive, optimized for an image generation model, explicitly aim for a YOUTUBE THUMBNAIL with a **16:9 aspect ratio, cinematic quality, and high detail**.

Inspiration Image: {{media url=inspirationPhotoDataUri}}

{{else if prompt}}
Initial User Prompt: "{{{prompt}}}"
Refine and significantly expand upon this user prompt to make it highly effective for generating a compelling YOUTUBE THUMBNAIL. The refined prompt **MUST** start with "A dynamic 16:9 cinematic thumbnail." and strictly follow the **Reference Prompt Structure & Example** provided above.
If a Content Title is provided ({{#if title}}"{{{title}}}"{{else}}no title provided{{/if}}), ensure the refined prompt deeply aligns with and creatively incorporates the title's theme, especially in the "Thematic Integration (of Title)" section.
If user-suggested \`primaryColors\` are provided ({{#if primaryColors.length}}{{#each primaryColors}}{{{this}}}{{#unless @last}}, {{/unless}}{{/each}}{{else}}none provided{{/if}}), integrate them naturally into the "Color Palette" section of the structured prompt.
If \`masterTextSentences\` are provided, they define the "Overlays" section and are the ONLY text to be used. Otherwise, analyze the user prompt for overlay/text descriptions.
Transform the user's initial ideas into the detailed, structured format, ensuring all sections are fleshed out. Emphasize **16:9 aspect ratio, cinematic quality, and intricate details**.

{{else if title}}
No initial prompt or inspiration image provided. Generate a compelling, visually rich prompt for a YOUTUBE THUMBNAIL based solely on the Content Title: "{{{title}}}".
The prompt **MUST** start with "A dynamic 16:9 cinematic thumbnail." and strictly follow the **Reference Prompt Structure & Example** provided above.
If user-suggested \`primaryColors\` are provided ({{#if primaryColors.length}}{{#each primaryColors}}{{{this}}}{{#unless @last}}, {{/unless}}{{/each}}{{else}}none provided{{/if}}), naturally integrate them into the "Color Palette" section.
If \`masterTextSentences\` are provided, they define the "Overlays" section and are the ONLY text to be used.
Be imaginative and highly descriptive, populating all sections based on the title.
The prompt must clearly define visual elements and guide towards a **16:9 aspect ratio output with high detail** for the YOUTUBE THUMBNAIL.

{{else}}
No information provided except possibly master text or primary colors. Generate a generic, yet visually interesting, highly descriptive, and versatile prompt for a YOUTUBE THUMBNAIL.
The prompt **MUST** start with "A dynamic 16:9 cinematic thumbnail." and strictly follow the **Reference Prompt Structure & Example** provided above.
If user-suggested \`primaryColors\` are provided ({{#if primaryColors.length}}{{#each primaryColors}}{{{this}}}{{#unless @last}}, {{/unless}}{{/each}}{{else}}none provided{{/if}}), naturally integrate them into the "Color Palette" section (e.g., suggesting how they might enhance a generic theme like 'captivating content').
If \`masterTextSentences\` are provided, they define the "Overlays" section and are the ONLY text to be used.
Populate all sections to create a well-rounded, detailed prompt.
The prompt must explicitly guide towards a **16:9 aspect ratio output with high detail** for the YOUTUBE THUMBNAIL.

Example of a generic prompt following the structure:
"A dynamic 16:9 cinematic thumbnail.
Subject & Scene: A futuristic abstract composition featuring swirling neon lines in electric blue and magenta intermingling with glowing geometric particles.
{{#if masterTextSentences.length}}
Overlays: The following text MUST be prominently displayed and be the ONLY text on the thumbnail: {{#each masterTextSentences}}'{{{this}}}'{{#unless @last}}; {{/unless}}{{/each}}. Arrange attractively.
{{else}}
Overlays: Subtle digital glitch effects in the corners.
{{/if}}
Human Element: None.
Color Palette: {{#if primaryColors.length}}Primarily uses {{#each primaryColors}}{{{this}}}{{#unless @last}}, {{/unless}}{{/each}}, blended with electric blue, magenta, vibrant yellow, against a dark, textured, slightly reflective background.{{else}}Electric blue, magenta, vibrant yellow, against a dark, textured, slightly reflective background.{{/if}}
Lighting: Neon glow emanating from the lines and particles, creating a sense of high energy.
Composition: Wide, landscape (16:9) orientation with a clear sense of depth, lines leading the eye.
Thematic Integration (of Title): This image evokes a sense of advanced technology and profound mystery, suitable for 'captivating content'.
Artistic Style: Modern, eye-catching, sharp details, abstract digital art.
Ensure high detail and suitability for a YouTube thumbnail."
{{/if}}

The final output prompt must be a single, coherent paragraph of text, structured as described, extremely descriptive, optimized for an image generation model, explicitly aiming for a YOUTUBE THUMBNAIL with a **16:9 aspect ratio, high visual quality, and intricate detail**, and **ALWAYS** starting with "A dynamic 16:9 cinematic thumbnail."
Improved Image Generation Prompt (for a YOUTUBE THUMBNAIL that is **16:9 aspect ratio, high detail**):`,
  config: {
    safetySettings: [
      { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_ONLY_HIGH' },
      { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_NONE' }, 
      { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
      { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
    ],
    maxOutputTokens: 1500, 
  },
  // helpers: { // Removed 'add' helper
  //   add: (a: number, b: number) => a + b,
  // }
});

const improvePromptFlow = ai.defineFlow(
  {
    name: 'improvePromptFlow',
    inputSchema: ImprovePromptInputSchema,
    outputSchema: ImprovePromptOutputSchema,
  },
  async input => {
    const promptData: any = { ...input };

    if (input.masterTextSentences && input.masterTextSentences.length > 0) {
      const sentencesDetails = input.masterTextSentences
        .map((sentence, idx) => `Sentence ${idx + 1}: "${sentence.replace(/"/g, '""')}"`) // Basic quote escaping
        .join(' ');
      promptData.masterTextInstructionForLLM = `Master Text (Absolute - Use ONLY this text for overlays): ${sentencesDetails}\nThis Master Text supersedes any text found in inspiration images or suggested by other parts of the prompt.`;
    }

    const {output} = await retry(() => prompt(promptData), 3, 1000);
    if (!output || !output.improvedPrompt || output.improvedPrompt.trim() === "") {
      console.error("Prompt improvement/generation failed or returned empty output. Input:", input, "Raw Output:", output);
      throw new Error('Prompt improvement/generation failed or did not return valid, non-empty output.');
    }
    // Ensure the prompt always starts with the required prefix, even if the AI missed it.
    if (!output.improvedPrompt.trim().toLowerCase().startsWith("a dynamic 16:9 cinematic thumbnail.")) {
        output.improvedPrompt = "A dynamic 16:9 cinematic thumbnail. " + output.improvedPrompt;
    }
    return output;
  }
);