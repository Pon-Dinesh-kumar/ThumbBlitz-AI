"use client";

import * as React from "react";
import { useState, useEffect, useCallback, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Image from "next/image";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/hooks/use-toast";
import { AppLogo } from "@/components/icons/AppLogo";
import { cn, imageUrlToDataUri } from "@/lib/utils";

import { improvePrompt } from "@/ai/flows/improve-prompt";
import { generateThumbnail } from "@/ai/flows/generate-thumbnail";
import { searchYouTubeVideos, getMockYouTubeVideos, type YouTubeVideo } from "@/services/youtube";

import { Wand2, Download, RefreshCw, Loader2, AlertTriangle, Image as ImageIcon, Sparkles, Youtube, CheckCircle, Search, XCircle, PlusCircle, SlidersHorizontal, ListChecks, X, UserCheck, Type, Palette, CaseSensitive, Settings2, Bot, User, PaletteIcon, ThumbsUp, MessageSquarePlus, Send, Edit3 } from "lucide-react";

const MAX_SENTENCE_LENGTH = 70;
const FIXED_NUM_THUMBNAILS = 4;
const API_CONFIG_ERROR_PREFIX = "[API_CONFIG_ERROR]";
const YOUTUBE_RESULTS_PER_PAGE = 9;
const PREDEFINED_COLORS = ["Red", "Orange", "Yellow", "Green", "Blue", "Purple", "Pink", "Brown", "Black", "White", "Gray", "Teal", "Cyan", "Magenta", "Lime", "Indigo", "Violet"];
const MAX_PRIMARY_COLORS = 4;

type ChatStep = "start" | "primaryColors" | "inspirationVideo" | "adjustInspiration" | "masterText" | "basePrompt" | "generating" | "results";

interface ChatMessage {
  id: string;
  sender: "user" | "bot" | "system";
  type: "text" | "colorSelector" | "inspirationSelector" | "masterTextForm" | "promptForm" | "loading" | "error" | "custom";
  content: React.ReactNode;
  timestamp: Date;
}

interface SelectedInspiration {
  video: YouTubeVideo;
  level: number;
  id: string;
  useSameFace: boolean;
  useSameText: boolean;
}

const masterTextFormSchema = z.object({
  masterTextPrimary: z.string().max(MAX_SENTENCE_LENGTH, { message: `Max ${MAX_SENTENCE_LENGTH} chars.` }).optional(),
  masterTextSecondary: z.string().max(MAX_SENTENCE_LENGTH, { message: `Max ${MAX_SENTENCE_LENGTH} chars.` }).optional(),
});
type MasterTextFormValues = z.infer<typeof masterTextFormSchema>;

const promptFormSchema = z.object({
  initialPrompt: z.string().max(1500, { message: "Max 1500 chars." }).optional(),
});
type PromptFormValues = z.infer<typeof promptFormSchema>;

const generateBroaderQuery = (originalTitle: string): string => {
  const words = originalTitle.trim().split(/\s+/);
  if (words.length > 3) {
    return words.slice(0, 3).join(" ");
  }
  return originalTitle;
};


function GeneratorChatPageInternal() {
  const searchParams = useSearchParams();
  const initialTitle = searchParams.get("title") || "";

  const [title, setTitle] = useState(initialTitle);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [currentStep, setCurrentStep] = useState<ChatStep>("start");

  const [primaryColors, setPrimaryColors] = useState<string[]>([]);
  const [selectedInspirations, setSelectedInspirations] = useState<SelectedInspiration[]>([]);
  const [masterTextSentences, setMasterTextSentences] = useState<string[]>([]);
  const [basePrompt, setBasePrompt] = useState<string>("");


  const [thumbnailUrls, setThumbnailUrls] = useState<string[]>(Array(FIXED_NUM_THUMBNAILS).fill(""));
  const [generationError, setGenerationError] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false); // General loading state for AI calls

  const [youtubeVideos, setYoutubeVideos] = useState<YouTubeVideo[]>([]);
  const [isFetchingYouTubeVideos, setIsFetchingYouTubeVideos] = useState(false);
  const [showYouTubeModal, setShowYouTubeModal] = useState(false);
  const [youtubeSearchError, setYoutubeSearchError] = useState<string | null>(null);
  const [isShowingMockData, setIsShowingMockData] = useState(false);
  const [youtubeNextPageToken, setYoutubeNextPageToken] = useState<string | undefined>(undefined);
  const [isFetchingMoreYouTubeVideos, setIsFetchingMoreYouTubeVideos] = useState(false);
  const [currentYoutubeSearchQuery, setCurrentYoutubeSearchQuery] = useState<string>("");
  const [showInspirationLevelModal, setShowInspirationLevelModal] = useState(false);
  const [hasUserEnhancedPrompt, setHasUserEnhancedPrompt] = useState(false);
  const [lastEnhancedPrompt, setLastEnhancedPrompt] = useState<string | null>(null);

  const messageIdCounter = React.useRef(0);
  const initialMessageSentRef = React.useRef(false);

  const { toast } = useToast();
  const envYouTubeApiKey = "AIzaSyD1JG9hr3ciY8QP1StCmYjByVd3LyBIaRw"; // Hardcoded as requested

  const masterTextForm = useForm<MasterTextFormValues>({
    resolver: zodResolver(masterTextFormSchema),
    defaultValues: { masterTextPrimary: "", masterTextSecondary: "" },
  });

  const promptForm = useForm<PromptFormValues>({
    resolver: zodResolver(promptFormSchema),
    defaultValues: { initialPrompt: "" },
  });

  const chatScrollRef = React.useRef<HTMLDivElement>(null);

  const [isTyping, setIsTyping] = useState(false);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [isInitialized, setIsInitialized] = useState(false);

  // Add typing animation component
  const TypingAnimation = () => (
    <div className="flex justify-start mb-3 animate-fade-in">
      <div className="max-w-[80%] p-3 rounded-2xl bg-[#23243A] text-white rounded-bl-none shadow-lg">
        <div className="flex items-center gap-1.5 mb-2">
          <span className="inline-block align-middle">
            <AppLogo baseSize={6} withText={false} />
          </span>
          <span className="text-xs font-medium text-primary/90">ThumbBlitz AI</span>
        </div>
        <div className="flex space-x-1">
          <div className="w-2 h-2 bg-[var(--brand-gradient-to)] rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
          <div className="w-2 h-2 bg-[var(--brand-gradient-to)] rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
          <div className="w-2 h-2 bg-[var(--brand-gradient-to)] rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
        </div>
      </div>
    </div>
  );

  const addMessage = useCallback((sender: ChatMessage["sender"], type: ChatMessage["type"], content: React.ReactNode) => {
    const newId = `msg-${Date.now()}-${messageIdCounter.current++}`;
    setChatMessages(prev => [...prev, { id: newId, sender, type, content, timestamp: new Date() }]);
  }, []);

  // Add auto-scroll effect for chat messages
  useEffect(() => {
    if (chatScrollRef.current) {
      const scrollContainer = chatScrollRef.current.querySelector('[data-radix-scroll-area-viewport]');
      if (scrollContainer) {
        scrollContainer.scrollTop = scrollContainer.scrollHeight;
      }
    }
  }, [chatMessages, isTyping, currentStep]);

  // Add auto-scroll effect for input section
  useEffect(() => {
    if (!isTransitioning && currentStep !== "generating" && currentStep !== "results") {
      setTimeout(() => {
        if (chatScrollRef.current) {
          const scrollContainer = chatScrollRef.current.querySelector('[data-radix-scroll-area-viewport]');
          if (scrollContainer) {
            scrollContainer.scrollTop = scrollContainer.scrollHeight;
          }
        }
      }, 100); // Small delay to ensure the input section is rendered
    }
  }, [currentStep, isTransitioning]);

  const addMessageWithTyping = (content: string, nextStep: ChatStep) => {
    setIsTyping(true);
    setIsTransitioning(true);

    // Show typing animation for 2 seconds
    setTimeout(() => {
      addMessage("bot", "text", content);
      setCurrentStep(nextStep);
      setIsTyping(false);
      setIsTransitioning(false);
    }, 2000);
  };

  const initializeChat = useCallback(() => {
    if (!initialMessageSentRef.current) {
      // Add system message immediately
      addMessage("system", "text", `Starting thumbnail generation for: "${title}"`);
      initialMessageSentRef.current = true;
      setIsInitialized(true);

      // Add first bot message with typing animation
      addMessageWithTyping(
        "Great! Let's start by picking some primary colors you'd like to see in your thumbnails. (Optional)",
        "primaryColors"
      );
    }
  }, [title, addMessage]);

  // Initial bot message
  useEffect(() => {
    if (!isInitialized && title && currentStep === "start" && chatMessages.length === 0) {
      initializeChat();
    }
  }, [title, currentStep, chatMessages.length, isInitialized, initializeChat]);

  const handlePrimaryColorSelect = (selectedColors: string[]) => {
    if (isTransitioning) return;
    
    setPrimaryColors(selectedColors);
    addMessage("user", "text", selectedColors.length > 0 ? `Selected colors: ${selectedColors.join(", ")}` : "Skipped color selection.");
    
    addMessageWithTyping(
      "Awesome! Now, would you like to find a YouTube video for visual inspiration? This can greatly influence the style.",
      "inspirationVideo"
    );
  };
  
  const handleInspirationChoice = (choice: "yes" | "skip") => {
    if (choice === "yes") {
      addMessage("user", "text", "Yes, let's find inspiration.");
      setShowYouTubeModal(true);
      fetchAndSetYoutubeVideos(title, undefined);
    } else {
      addMessage("user", "text", "No, I'll skip video inspiration for now.");
      setSelectedInspirations([]);
      addMessageWithTyping(
        "Okay. Next, do you want to specify any 'Master Text'? This text will be the ONLY text on your thumbnails, overriding everything else.",
        "masterText"
      );
    }
  };

  const handleConfirmYouTubeSelections = async () => {
    if (selectedInspirations.length > 0) {
      addMessage("user", "text", `Selected ${selectedInspirations.length} video(s) for inspiration.`);
      setShowYouTubeModal(false);
      setShowInspirationLevelModal(true);
      setCurrentStep("adjustInspiration");
      addMessage("bot", "text", "Let's adjust the influence levels and details for your chosen inspirations.");
    } else {
      addMessage("user", "text", "No inspiration videos selected.");
      setShowYouTubeModal(false);
      addMessageWithTyping(
        "Okay. Next, do you want to specify any 'Master Text'? This text will be the ONLY text on your thumbnails, overriding everything else.",
        "masterText"
      );
    }
  };
  
  const handleSkipInspirationFromModal = () => {
    addMessage("user", "text", "Skipped video inspiration.");
    setShowYouTubeModal(false);
    setSelectedInspirations([]);
    addMessageWithTyping(
      "Okay. Next, do you want to specify any 'Master Text'? This text will be the ONLY text on your thumbnails, overriding everything else.",
      "masterText"
    );
  };

  const handleConfirmInspirationAndProceed = () => {
    addMessage("user", "text", "Inspiration details confirmed.");
    setShowInspirationLevelModal(false);
    addMessageWithTyping(
      "Got it. Now, do you want to specify any 'Master Text'? This text (up to 3 sentences) will be the ONLY text on your thumbnails.",
      "masterText"
    );
  };
  
  const handleMasterTextSubmit = (data: MasterTextFormValues) => {
    const sentences = [data.masterTextPrimary, data.masterTextSecondary].filter(Boolean) as string[];
    setMasterTextSentences(sentences);
    if (sentences.length > 0) {
      addMessage("user", "text", `Master text set: ${sentences.map(s => `"${s}"`).join("; ")}`);
    } else {
      addMessage("user", "text", "Skipped master text.");
    }
    masterTextForm.reset();
    addMessageWithTyping(
      "Finally, do you have a base description or prompt in mind? Or would you like me to generate one based on your title and inspirations (if any)?",
      "basePrompt"
    );
  };

  const handlePromptSubmit = async (data: PromptFormValues, action: "submit" | "enhance" | "generate") => {
    setIsProcessing(true);
    addMessage("bot", "loading", "Thinking...");
    
    let finalPrompt = data.initialPrompt || "";

    if (action === "generate" || (action === "enhance" && !finalPrompt.trim())) {
        addMessage("user", "text", action === "generate" ? "Generate a prompt for me." : "No prompt provided, generating one...");
        try {
            const firstInspiration = selectedInspirations.length > 0 ? selectedInspirations[0] : undefined;
            let inspirationUriForPrompting: string | undefined = undefined;
            if (firstInspiration) {
                 inspirationUriForPrompting = await imageUrlToDataUri(firstInspiration.video.thumbnailUrl);
            }

            const result = await improvePrompt({
                title: title,
                prompt: undefined, 
                inspirationPhotoDataUri: inspirationUriForPrompting,
                primaryColors: primaryColors,
                masterTextSentences: masterTextSentences.length > 0 ? masterTextSentences : undefined,
            });
            finalPrompt = result.improvedPrompt;
            promptForm.setValue('initialPrompt', finalPrompt);
            setLastEnhancedPrompt(finalPrompt);
            addMessage("bot", "text", `Here's a generated prompt (it will be used for all ${FIXED_NUM_THUMBNAILS} images unless different inspirations change it for specific images): ${finalPrompt}`);
            setHasUserEnhancedPrompt(true); 
        } catch (e: any) {
            addMessage("bot", "error", `Failed to generate prompt: ${e.message}`);
            setIsProcessing(false);
            setChatMessages(prev => prev.filter(msg => msg.type !== "loading"));
            return;
        }
    } else if (action === "enhance") {
        addMessage("user", "text", `Enhance this prompt: "${finalPrompt}"`);
        try {
            const firstInspiration = selectedInspirations.length > 0 ? selectedInspirations[0] : undefined;
            let inspirationUriForPrompting: string | undefined = undefined;
            if (firstInspiration) {
                 inspirationUriForPrompting = await imageUrlToDataUri(firstInspiration.video.thumbnailUrl);
            }

            const result = await improvePrompt({
                title: title,
                prompt: finalPrompt,
                inspirationPhotoDataUri: inspirationUriForPrompting, // Also pass inspiration to enhance
                primaryColors: primaryColors,
                masterTextSentences: masterTextSentences.length > 0 ? masterTextSentences : undefined,
            });
            finalPrompt = result.improvedPrompt;
            promptForm.setValue('initialPrompt', finalPrompt);
            setLastEnhancedPrompt(finalPrompt);
            addMessage("bot", "text", `Here's the enhanced prompt (it will be used for all ${FIXED_NUM_THUMBNAILS} images unless different inspirations change it for specific images): ${finalPrompt}`);
            setHasUserEnhancedPrompt(true);
        } catch (e: any) {
            addMessage("bot", "error", `Failed to enhance prompt: ${e.message}`);
            setIsProcessing(false);
            setChatMessages(prev => prev.filter(msg => msg.type !== "loading"));
            return;
        }
    } else { // submit
        addMessage("user", "text", finalPrompt ? `Using prompt: "${finalPrompt}"` : "Skipped custom prompt, will generate if needed.");
        setHasUserEnhancedPrompt(false); // User submitted their own, not enhanced by us initially for display
        setLastEnhancedPrompt(null);
    }
    
    setBasePrompt(finalPrompt); 
    setIsProcessing(false);
    setChatMessages(prev => prev.filter(msg => msg.type !== "loading"));

    addMessage("system", "text", "All inputs collected. Ready to generate thumbnails!");
    await proceedToGenerateThumbnails(finalPrompt);
  };

  const proceedToGenerateThumbnails = async (currentImprovedPrompt: string) => {
    setIsProcessing(true);
    setGenerationError(null);
    setThumbnailUrls(Array(FIXED_NUM_THUMBNAILS).fill("")); 
    setCurrentStep("generating");
    addMessage("bot", "loading", `AI is Creating ${FIXED_NUM_THUMBNAILS} Thumbnail(s)... This may take some time.`);

    let generatedImageUris: string[] = [];
    let anyErrorOccurred = false;
    

    for (let i = 0; i < FIXED_NUM_THUMBNAILS; i++) {
      let promptForThisImage = currentImprovedPrompt || lastEnhancedPrompt || ""; // Start with the overall enhanced/submitted prompt
      let inspirationPhotoDataUri: string | undefined = undefined;
      let inspirationLevelForThisImage: number | undefined = undefined;
      let useSameFaceForThisImage: boolean | undefined = undefined;
      let useSameTextForThisImage: boolean | undefined = undefined;
      
      const inspirationForItem = selectedInspirations[i]; 

      if (inspirationForItem) {
        try {
            const inspirationUri = await imageUrlToDataUri(inspirationForItem.video.thumbnailUrl);
            inspirationPhotoDataUri = inspirationUri;
            inspirationLevelForThisImage = inspirationForItem.level;
            useSameFaceForThisImage = inspirationForItem.useSameFace;
            useSameTextForThisImage = inspirationForItem.useSameText;
            
            if (!promptForThisImage) {
                addMessage("system", "text", `No global prompt. Generating prompt for image ${i + 1} using its specific inspiration...`);
                const result = await improvePrompt({
                    title: title,
                    prompt: undefined, // Force generation from inspiration
                    inspirationPhotoDataUri: inspirationUri,
                    primaryColors: primaryColors,
                    masterTextSentences: masterTextSentences.length > 0 ? masterTextSentences : undefined,
                });
                promptForThisImage = result.improvedPrompt;
                 if (i === 0 && !currentImprovedPrompt && !lastEnhancedPrompt) { 
                    setBasePrompt(promptForThisImage); 
                 }
            }
        } catch (e: any) {
          addMessage("bot", "error", `Inspiration Error (Image ${i+1}): ${e.message}`);
          inspirationPhotoDataUri = undefined; // Clear if error
        }
      } else if (!promptForThisImage && title) { // No specific inspiration, no global prompt, but have title
         addMessage("system", "text", `No global prompt or specific inspiration for image ${i + 1}. Generating from title...`);
          try {
            const result = await improvePrompt({ 
                title: title, 
                primaryColors: primaryColors, 
                masterTextSentences: masterTextSentences.length > 0 ? masterTextSentences : undefined 
            });
            promptForThisImage = result.improvedPrompt;
            if (i === 0 && !currentImprovedPrompt && !lastEnhancedPrompt) {
                setBasePrompt(promptForThisImage);
            }
          } catch(e:any) {
            setGenerationError(prev => `${prev ? prev + '\n' : ''}Failed to generate prompt for image ${i+1} from title: ${e.message}`);
            anyErrorOccurred = true;
            addMessage("bot", "error", `Title-Prompt Gen Failed (Image ${i+1}): ${e.message}`);
            continue;
          }
      }
      
      if (!promptForThisImage.trim()) { // Final check if we have a prompt
        const errorMsg = `No usable prompt for image ${i + 1}. Cannot generate. Title: "${title}", Inspiration provided: ${!!inspirationPhotoDataUri}`;
        setGenerationError(prev => prev ? `${prev}\n${errorMsg}` : errorMsg);
        anyErrorOccurred = true;
        addMessage("bot", "error", errorMsg);
        continue;
      }

      try {
        addMessage("system", "text", `Generating Image ${i + 1}/${FIXED_NUM_THUMBNAILS}...`);
        const generationResult = await generateThumbnail({
          improvedPrompt: promptForThisImage, 
          inspirationPhotoDataUri: inspirationPhotoDataUri,
          inspirationLevel: inspirationLevelForThisImage,
          useSameFace: useSameFaceForThisImage,
          useSameText: useSameTextForThisImage,
          primaryColors: primaryColors,
          masterTextSentences: masterTextSentences.length > 0 ? masterTextSentences : undefined,
        });
        generatedImageUris.push(generationResult.thumbnailDataUri);
        setThumbnailUrls(prevUrls => {
            const newUrls = [...prevUrls];
            newUrls[i] = generationResult.thumbnailDataUri;
            return newUrls;
        });

      } catch (e: any) {
        let errorMessage = `Error generating image ${i + 1}: An unexpected error occurred.`;
        if (e instanceof Error) {
          errorMessage = `Error generating image ${i + 1}: ${e.message}`;
        }
        setGenerationError(prev => prev ? `${prev}\n${errorMessage}` : errorMessage);
        anyErrorOccurred = true;
        addMessage("bot", "error", errorMessage);
      }
    }
    
    setChatMessages(prev => prev.filter(msg => msg.type !== "loading"));
    setIsProcessing(false);
    setCurrentStep("results");

    if (generatedImageUris.length > 0 && !anyErrorOccurred) {
      addMessage("bot", "text", `Successfully created ${generatedImageUris.length} new thumbnail(s)! Check them out on the right.`);
    } else if (generatedImageUris.length > 0 && anyErrorOccurred) {
      addMessage("bot", "text", `Generated ${generatedImageUris.length} thumbnail(s), but some errors occurred. See details above or in console.`);
    } else if (anyErrorOccurred) {
      addMessage("bot", "error", `Thumbnail generation failed. ${generationError || "Please check the console for more details."}`);
    } else {
      addMessage("bot", "error", "No thumbnails were generated. Unknown issue.");
    }
  };

  const fetchAndSetYoutubeVideos = useCallback(
    async (requestedQuery: string, pageToken?: string) => {
      const loadingStateSetter = pageToken ? setIsFetchingMoreYouTubeVideos : setIsFetchingYouTubeVideos;
      loadingStateSetter(true);
      setYoutubeSearchError(null);
  
      let queryToUse = requestedQuery;
      let attemptedBroaderSearch = false;
  
      if (!pageToken) { 
        setCurrentYoutubeSearchQuery(requestedQuery); 
        setYoutubeVideos([]);
        setYoutubeNextPageToken(undefined);
  
        try {
          const initialResult = await searchYouTubeVideos(
            requestedQuery,
            envYouTubeApiKey,
            YOUTUBE_RESULTS_PER_PAGE,
            undefined 
          );
  
          if (initialResult.videos.length > 0) {
            setYoutubeVideos(initialResult.videos);
            setYoutubeNextPageToken(initialResult.nextPageToken);
            loadingStateSetter(false);
            return;
          }
          
          if (requestedQuery === title) { 
              const broaderQuery = generateBroaderQuery(title);
              if (broaderQuery !== title) {
                  toast({ title: "Broadening Search...", description: `No exact matches for "${title}". Trying "${broaderQuery}".` });
                  queryToUse = broaderQuery;
                  attemptedBroaderSearch = true;
                  setCurrentYoutubeSearchQuery(broaderQuery); 
              }
          }
        } catch (e: any) {
          if (e.message.startsWith(API_CONFIG_ERROR_PREFIX)) {
            setYoutubeSearchError(`${e.message.replace(API_CONFIG_ERROR_PREFIX, '')} Mock videos are shown below; they are not relevant to your title.`);
            const { videos: mockVideos, nextPageToken: mockNextPageToken } = await getMockYouTubeVideos();
            setYoutubeVideos(mockVideos);
            setYoutubeNextPageToken(mockNextPageToken);
            setIsShowingMockData(true);
          } else {
             setYoutubeSearchError(e.message || "Failed to fetch YouTube videos.");
             toast({ title: "YouTube Search Failed", description: e.message, variant: "destructive" });
          }
          loadingStateSetter(false);
          return;
        }
      } else {
        queryToUse = currentYoutubeSearchQuery; 
      }
  
      try {
        const { videos: fetchedVideos, nextPageToken: newNextPageToken } = await searchYouTubeVideos(
          queryToUse,
          envYouTubeApiKey,
          YOUTUBE_RESULTS_PER_PAGE,
          pageToken 
        );
  
        setYoutubeVideos(prevVideos => pageToken ? [...prevVideos, ...fetchedVideos] : fetchedVideos);
        setYoutubeNextPageToken(newNextPageToken);
  
        if (!pageToken && fetchedVideos.length === 0) { 
          let finalMessage = `No relevant YouTube videos found for "${title}".`;
          if (attemptedBroaderSearch && queryToUse !== title) {
              finalMessage += ` Also tried with "${queryToUse}".`;
          }
          finalMessage += " You can skip or refine your title.";
          setYoutubeSearchError(finalMessage);
        }
      } catch (e: any) {
        const errMsg = e.message || "Failed to fetch YouTube videos.";
        if (e.message.startsWith(API_CONFIG_ERROR_PREFIX)) {
          if (pageToken) { // Error on "load more"
               toast({ title: "YouTube Load More Failed", description: errMsg.replace(API_CONFIG_ERROR_PREFIX, ''), variant: "destructive" });
               setYoutubeSearchError(errMsg.replace(API_CONFIG_ERROR_PREFIX, '')); 
          } else { // Error on initial fetch after trying real API
              setYoutubeSearchError(`${errMsg.replace(API_CONFIG_ERROR_PREFIX, '')} Mock videos are shown below; they are not relevant to your title.`);
              const { videos: mockVideos, nextPageToken: mockNextPageToken } = await getMockYouTubeVideos();
              setYoutubeVideos(mockVideos);
              setYoutubeNextPageToken(mockNextPageToken);
              setIsShowingMockData(true);
          }
        } else {
          setYoutubeSearchError(errMsg);
          if (!pageToken) setYoutubeVideos([]); // Clear videos if initial search failed non-API config way
          toast({ title: "YouTube Search Failed", description: errMsg, variant: "destructive" });
        }
      } finally {
        loadingStateSetter(false);
      }
    },
    [envYouTubeApiKey, title, toast, currentYoutubeSearchQuery] 
  );

  const handleLoadMoreYoutubeVideos = () => {
    if (!youtubeNextPageToken || isFetchingMoreYouTubeVideos || isFetchingYouTubeVideos) return;
    if (!currentYoutubeSearchQuery) { 
      toast({ title: "Search Query Missing", description: "Cannot load more without an active search query.", variant: "destructive"});
      return;
    }
    fetchAndSetYoutubeVideos(currentYoutubeSearchQuery, youtubeNextPageToken);
  };

  const handleToggleInspirationSelection = (video: YouTubeVideo) => {
    setSelectedInspirations(prev => {
      const existingIndex = prev.findIndex(insp => insp.id === video.id);
      if (existingIndex > -1) {
        return prev.filter(insp => insp.id !== video.id);
      } else {
        if (prev.length < FIXED_NUM_THUMBNAILS) {
          return [...prev, { video, level: 80, id: video.id, useSameFace: false, useSameText: false }];
        } else {
          toast({ title: "Inspiration Limit Reached", description: `You can select up to ${FIXED_NUM_THUMBNAILS} inspirations.`, variant: "default" });
        }
      }
      return prev;
    });
  };

  const handleUpdateInspirationLevel = (videoId: string, newLevel: number) => {
    setSelectedInspirations(prev =>
      prev.map(inspiration => inspiration.id === videoId ? { ...inspiration, level: newLevel } : inspiration)
    );
  };

  const handleUpdateInspirationToggles = (videoId: string, toggleName: 'useSameFace' | 'useSameText', value: boolean) => {
    setSelectedInspirations(prev =>
      prev.map(inspiration => inspiration.id === videoId ? { ...inspiration, [toggleName]: value } : inspiration)
    );
  };
  
  const handleDownload = (url: string, index: number) => {
    if (!url || url.startsWith("data:image/svg+xml")) return; // Don't download placeholders
    const link = document.createElement('a');
    link.href = url;
    const extension = url.substring(url.indexOf('/') + 1, url.indexOf(';base64')) || 'png';
    link.download = `thumbblitz_ai_thumbnail_${(title || `image_${index + 1}`).replace(/\s+/g, '_')}_${Date.now()}.${extension}`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast({
      title: `Download Started (Image ${index+1})`,
      description: "Your thumbnail is downloading.",
    });
  };

  const handleRegenerate = async () => {
     if (isProcessing) {
       toast({ title: "Cannot Regenerate", description: "Another operation is in progress.", variant: "destructive" });
       return;
    }
    addMessage("user", "text", "Regenerate thumbnails with current settings.");
    await proceedToGenerateThumbnails(basePrompt || lastEnhancedPrompt || "");
  };

  const handleStartOver = () => {
    // Reset all states
    setTitle(initialTitle); 
    setPrimaryColors([]);
    setSelectedInspirations([]);
    setMasterTextSentences([]);
    setBasePrompt("");
    setThumbnailUrls(Array(FIXED_NUM_THUMBNAILS).fill(""));
    setGenerationError(null);
    setChatMessages([]);
    setCurrentStep("start");
    masterTextForm.reset();
    promptForm.reset();
    setHasUserEnhancedPrompt(false);
    setLastEnhancedPrompt(null);
    messageIdCounter.current = 0; 
    initialMessageSentRef.current = false;
    setIsTyping(false);
    setIsTransitioning(false);
    setIsInitialized(false);

    // Start new conversation after a small delay
    if (initialTitle) {
      setTimeout(() => {
        initializeChat();
      }, 100);
    }
  };


  const renderCurrentStepInput = () => {
    switch (currentStep) {
      case "primaryColors":
        return (
          <div className="p-4 bg-black/40 backdrop-blur-sm rounded-lg shadow-lg relative">
            <div className="absolute inset-0 rounded-lg pointer-events-none" style={{
              background: 'linear-gradient(90deg, var(--brand-gradient-from), var(--brand-gradient-via), var(--brand-gradient-to))',
              opacity: 0.1,
              zIndex: 0
            }} />
            <div className="absolute inset-0 rounded-lg pointer-events-none" style={{
              border: '1px solid transparent',
              background: 'linear-gradient(90deg, var(--brand-gradient-from), var(--brand-gradient-via), var(--brand-gradient-to)) border-box',
              WebkitMask: 'linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0)',
              WebkitMaskComposite: 'xor',
              maskComposite: 'exclude',
              zIndex: 1
            }} />
            <div className="relative z-10">
              <Label className="text-sm font-medium text-foreground/90 flex items-center gap-2 mb-3">
                <PaletteIcon className="h-4 w-4 text-[var(--brand-gradient-to)]" /> 
                <span className="bg-gradient-to-r from-[var(--brand-gradient-from)] via-[var(--brand-gradient-via)] to-[var(--brand-gradient-to)] bg-clip-text text-transparent">
                  Select Primary Colors (Up to {MAX_PRIMARY_COLORS})
                </span>
              </Label>
              <div className="grid grid-cols-3 sm:grid-cols-4 gap-3">
                {PREDEFINED_COLORS.map(color => (
                  <div 
                    key={color} 
                    className={cn(
                      "group relative flex items-center space-x-2 p-2 rounded-lg transition-all duration-200",
                      primaryColors.includes(color) 
                        ? "bg-gradient-to-r from-[var(--brand-gradient-from)]/20 via-[var(--brand-gradient-via)]/20 to-[var(--brand-gradient-to)]/20 border border-[var(--brand-gradient-to)]/30" 
                        : "hover:bg-white/5 border border-transparent"
                    )}
                  >
                    <Checkbox
                      id={`chat-color-${color}`}
                      checked={primaryColors.includes(color)}
                      onCheckedChange={() => {
                        setPrimaryColors(prevColors => {
                          const newColors = prevColors.includes(color)
                            ? prevColors.filter(c => c !== color)
                            : [...prevColors, color];
                          if (newColors.length > MAX_PRIMARY_COLORS) {
                            toast({ title: "Color Limit", description: `Max ${MAX_PRIMARY_COLORS} colors.`, variant: "default" });
                            return prevColors;
                          }
                          return newColors;
                        });
                      }}
                      disabled={isProcessing || (primaryColors.length >= MAX_PRIMARY_COLORS && !primaryColors.includes(color))}
                      className={cn(
                        "transition-all duration-200",
                        primaryColors.includes(color) 
                          ? "border-[var(--brand-gradient-to)] data-[state=checked]:bg-[var(--brand-gradient-to)]" 
                          : "border-white/20"
                      )}
                    />
                    <Label 
                      htmlFor={`chat-color-${color}`} 
                      className={cn(
                        "text-xs font-medium cursor-pointer transition-all duration-200 flex-1",
                        primaryColors.includes(color) 
                          ? "text-[var(--brand-gradient-to)]" 
                          : "text-white/70 group-hover:text-white/90",
                        (isProcessing || (primaryColors.length >= MAX_PRIMARY_COLORS && !primaryColors.includes(color))) && !primaryColors.includes(color) 
                          ? "opacity-50 cursor-not-allowed" 
                          : ""
                      )}
                    >
                      {color}
                    </Label>
                    <div 
                      className={cn(
                        "w-3 h-3 rounded-full transition-all duration-200",
                        primaryColors.includes(color) ? "ring-2 ring-[var(--brand-gradient-to)]" : "ring-1 ring-white/20"
                      )}
                      style={{ backgroundColor: color.toLowerCase() }}
                    />
                  </div>
                ))}
              </div>
              <Button 
                onClick={() => handlePrimaryColorSelect(primaryColors)} 
                size="sm" 
                className={cn(
                  "mt-4 w-full transition-all duration-200 transform hover:scale-[1.02]",
                  primaryColors.length > 0
                    ? "bg-gradient-to-r from-[var(--brand-gradient-from)] via-[var(--brand-gradient-via)] to-[var(--brand-gradient-to)] hover:opacity-90"
                    : "bg-white/10 hover:bg-white/20 text-white/70 hover:text-white"
                )}
                disabled={isProcessing}
              >
                {primaryColors.length > 0 ? (
                  <>
                    Choose {primaryColors.length} Color{primaryColors.length > 1 ? 's' : ''} <Send className="ml-2 h-4 w-4" />
                  </>
                ) : (
                  <>
                    Skip Colors <X className="ml-2 h-4 w-4" />
                  </>
                )}
              </Button>
            </div>
          </div>
        );
      case "inspirationVideo":
        return (
          <div className="p-4 bg-black/40 backdrop-blur-sm rounded-lg shadow-lg relative">
            <div className="absolute inset-0 rounded-lg pointer-events-none" style={{
              background: 'linear-gradient(90deg, var(--brand-gradient-from), var(--brand-gradient-via), var(--brand-gradient-to))',
              opacity: 0.1,
              zIndex: 0
            }} />
            <div className="absolute inset-0 rounded-lg pointer-events-none" style={{
              border: '1px solid transparent',
              background: 'linear-gradient(90deg, var(--brand-gradient-from), var(--brand-gradient-via), var(--brand-gradient-to)) border-box',
              WebkitMask: 'linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0)',
              WebkitMaskComposite: 'xor',
              maskComposite: 'exclude',
              zIndex: 1
            }} />
            <div className="relative z-10">
              <div className="flex items-center gap-2 mb-3">
                <Youtube className="h-4 w-4 text-[var(--brand-gradient-to)]" />
                <span className="bg-gradient-to-r from-[var(--brand-gradient-from)] via-[var(--brand-gradient-via)] to-[var(--brand-gradient-to)] bg-clip-text text-transparent font-medium">
                  Find Inspiration
                </span>
              </div>
              <div className="flex flex-col sm:flex-row gap-3">
                <Button 
                  onClick={() => handleInspirationChoice("yes")} 
                  className="flex-1 group relative overflow-hidden bg-gradient-to-r from-[var(--brand-gradient-from)] via-[var(--brand-gradient-via)] to-[var(--brand-gradient-to)] hover:opacity-90 transition-all duration-200 transform hover:scale-[1.02]"
                  disabled={isProcessing}
                >
                  <div className="relative flex items-center justify-center gap-2">
                    <Youtube className="h-5 w-5 group-hover:scale-110 transition-transform duration-200" />
                    <span className="font-medium">Yes, find inspiration</span>
                  </div>
                </Button>
                <Button 
                  onClick={() => handleInspirationChoice("skip")} 
                  variant="outline" 
                  className="flex-1 group relative overflow-hidden bg-white/10 hover:bg-white/20 text-white/70 hover:text-white border-white/10 hover:border-white/20 transition-all duration-200 transform hover:scale-[1.02]"
                  disabled={isProcessing}
                >
                  <div className="relative flex items-center justify-center gap-2">
                    <X className="h-5 w-5 group-hover:scale-110 transition-transform duration-200" />
                    <span className="font-medium">Skip this</span>
                  </div>
                </Button>
              </div>
            </div>
          </div>
        );
      case "masterText":
        return (
          <form onSubmit={masterTextForm.handleSubmit(handleMasterTextSubmit)} className="p-4 bg-black/40 backdrop-blur-sm rounded-lg shadow-lg relative">
            <div className="absolute inset-0 rounded-lg pointer-events-none" style={{
              background: 'linear-gradient(90deg, var(--brand-gradient-from), var(--brand-gradient-via), var(--brand-gradient-to))',
              opacity: 0.1,
              zIndex: 0
            }} />
            <div className="absolute inset-0 rounded-lg pointer-events-none" style={{
              border: '1px solid transparent',
              background: 'linear-gradient(90deg, var(--brand-gradient-from), var(--brand-gradient-via), var(--brand-gradient-to)) border-box',
              WebkitMask: 'linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0)',
              WebkitMaskComposite: 'xor',
              maskComposite: 'exclude',
              zIndex: 1
            }} />
            <div className="relative z-10 space-y-4">
              <div className="flex items-center gap-2 mb-3">
                <Type className="h-4 w-4 text-[var(--brand-gradient-to)]" />
                <span className="bg-gradient-to-r from-[var(--brand-gradient-from)] via-[var(--brand-gradient-via)] to-[var(--brand-gradient-to)] bg-clip-text text-transparent font-medium">
                  Master Text (Optional)
                </span>
              </div>
              
              <div className="space-y-3">
                <div className="space-y-2">
                  <Label htmlFor="chatMasterTextPrimary" className="text-xs font-medium text-white/90">
                    Primary Text
                  </Label>
                  <div className="relative">
                    <Input
                      id="chatMasterTextPrimary"
                      placeholder="Enter primary text (max 70 chars)"
                      {...masterTextForm.register("masterTextPrimary")}
                      className="bg-black/40 border-white/10 text-white placeholder:text-white/40 focus:border-[var(--brand-gradient-to)] focus:ring-[var(--brand-gradient-to)]/20 transition-all duration-200"
                      disabled={isProcessing}
                    />
                    {masterTextForm.watch("masterTextPrimary") && (
                      <div className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-white/40">
                        {(masterTextForm.watch("masterTextPrimary") || "").length}/70
                      </div>
                    )}
                  </div>
                  {masterTextForm.formState.errors.masterTextPrimary && 
                    <p className="text-xs text-[var(--brand-gradient-from)] mt-1">{masterTextForm.formState.errors.masterTextPrimary?.message}</p>
                  }
                </div>

                <div className="space-y-2">
                  <Label htmlFor="chatMasterTextSecondary" className="text-xs font-medium text-white/90">
                    Secondary Text
                  </Label>
                  <div className="relative">
                    <Input
                      id="chatMasterTextSecondary"
                      placeholder="Enter secondary text (max 70 chars)"
                      {...masterTextForm.register("masterTextSecondary")}
                      className="bg-black/40 border-white/10 text-white placeholder:text-white/40 focus:border-[var(--brand-gradient-to)] focus:ring-[var(--brand-gradient-to)]/20 transition-all duration-200"
                      disabled={isProcessing}
                    />
                    {masterTextForm.watch("masterTextSecondary") && (
                      <div className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-white/40">
                        {(masterTextForm.watch("masterTextSecondary") || "").length}/70
                      </div>
                    )}
                  </div>
                  {masterTextForm.formState.errors.masterTextSecondary && 
                    <p className="text-xs text-[var(--brand-gradient-from)] mt-1">{masterTextForm.formState.errors.masterTextSecondary?.message}</p>
                  }
                </div>
              </div>

              <Button 
                type="submit" 
                size="sm" 
                className={cn(
                  "w-full transition-all duration-200 transform hover:scale-[1.02]",
                  (masterTextForm.watch("masterTextPrimary") || masterTextForm.watch("masterTextSecondary"))
                    ? "bg-gradient-to-r from-[var(--brand-gradient-from)] via-[var(--brand-gradient-via)] to-[var(--brand-gradient-to)] hover:opacity-90"
                    : "bg-white/10 hover:bg-white/20 text-white/70 hover:text-white"
                )}
                disabled={isProcessing}
              >
                {(masterTextForm.watch("masterTextPrimary") || masterTextForm.watch("masterTextSecondary")) ? (
                  <>
                    Choose Text <Send className="ml-2 h-4 w-4" />
                  </>
                ) : (
                  <>
                    Skip Text <X className="ml-2 h-4 w-4" />
                  </>
                )}
              </Button>
            </div>
          </form>
        );
        case "basePrompt":
          return (
            <form onSubmit={promptForm.handleSubmit(data => handlePromptSubmit(data, "submit"))} className="p-4 bg-black/40 backdrop-blur-sm rounded-lg shadow-lg relative">
              <div className="absolute inset-0 rounded-lg pointer-events-none" style={{
                background: 'linear-gradient(90deg, var(--brand-gradient-from), var(--brand-gradient-via), var(--brand-gradient-to))',
                opacity: 0.1,
                zIndex: 0
              }} />
              <div className="absolute inset-0 rounded-lg pointer-events-none" style={{
                border: '1px solid transparent',
                background: 'linear-gradient(90deg, var(--brand-gradient-from), var(--brand-gradient-via), var(--brand-gradient-to)) border-box',
                WebkitMask: 'linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0)',
                WebkitMaskComposite: 'xor',
                maskComposite: 'exclude',
                zIndex: 1
              }} />
              <div className="relative z-10 space-y-4">
                <div className="flex items-center gap-2 mb-3">
                  <Wand2 className="h-4 w-4 text-[var(--brand-gradient-to)]" />
                  <span className="bg-gradient-to-r from-[var(--brand-gradient-from)] via-[var(--brand-gradient-via)] to-[var(--brand-gradient-to)] bg-clip-text text-transparent font-medium">
                    Thumbnail Description
                  </span>
                </div>

                <div className="space-y-2">
                  <div className="relative">
                    <Textarea
                      placeholder="Describe your thumbnail, or let AI generate/enhance..."
                      {...promptForm.register("initialPrompt")}
                      className="min-h-[100px] bg-black/40 border-white/10 text-white placeholder:text-white/40 focus:border-[var(--brand-gradient-to)] focus:ring-[var(--brand-gradient-to)]/20 transition-all duration-200 resize-none"
                      disabled={isProcessing}
                    />
                    {promptForm.watch("initialPrompt") && (
                      <div className="absolute right-2 bottom-2 text-xs text-white/40">
                        {(promptForm.watch("initialPrompt") || "").length}/1500
                      </div>
                    )}
                  </div>
                  {promptForm.formState.errors.initialPrompt && 
                    <p className="text-xs text-[var(--brand-gradient-from)] mt-1">{promptForm.formState.errors.initialPrompt.message}</p>
                  }
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  <Button 
                    type="button" 
                    onClick={promptForm.handleSubmit(data => handlePromptSubmit(data, "generate"))} 
                    variant="outline" 
                    size="sm" 
                    disabled={isProcessing}
                    className="group relative overflow-hidden bg-gradient-to-r from-[var(--brand-gradient-from)] via-[var(--brand-gradient-via)] to-[var(--brand-gradient-to)] hover:opacity-90 text-white border-transparent transition-all duration-200"
                  >
                    <div className="relative flex items-center justify-center gap-2">
                      <Sparkles className="h-4 w-4 group-hover:scale-110 transition-transform duration-200" />
                      <span>Generate</span>
                    </div>
                  </Button>

                  <Button 
                    type="button" 
                    onClick={promptForm.handleSubmit(data => handlePromptSubmit(data, "enhance"))} 
                    variant="outline" 
                    size="sm" 
                    disabled={isProcessing || !promptForm.watch("initialPrompt")?.trim()}
                    className="group relative overflow-hidden bg-gradient-to-r from-[var(--brand-gradient-from)] via-[var(--brand-gradient-via)] to-[var(--brand-gradient-to)] hover:opacity-90 text-white border-transparent transition-all duration-200"
                  >
                    <div className="relative flex items-center justify-center gap-2">
                      <Wand2 className="h-4 w-4 group-hover:scale-110 transition-transform duration-200" />
                      <span>Enhance</span>
                    </div>
                  </Button>

                  <Button 
                    type="submit" 
                    size="sm" 
                    disabled={isProcessing}
                    className={cn(
                      "transition-all duration-200 transform hover:scale-[1.02]",
                      promptForm.watch("initialPrompt")?.trim()
                        ? "bg-gradient-to-r from-[var(--brand-gradient-from)] via-[var(--brand-gradient-via)] to-[var(--brand-gradient-to)] hover:opacity-90"
                        : "bg-white/10 hover:bg-white/20 text-white/70 hover:text-white"
                    )}
                  >
                    {promptForm.watch("initialPrompt")?.trim() ? (
                      <>
                        Use & Generate <Send className="ml-2 h-4 w-4" />
                      </>
                    ) : (
                      <>
                        Skip Prompt <X className="ml-2 h-4 w-4" />
                      </>
                    )}
                  </Button>
                </div>
              </div>
            </form>
          );
      default:
        return null;
    }
  };
  
  const getInspirationSelectionMessage = () => {
    const remaining = FIXED_NUM_THUMBNAILS - selectedInspirations.length;
    if (remaining === 0) return "All inspirations selected. Click 'Confirm Selections'.";
    if (remaining === FIXED_NUM_THUMBNAILS) return `Select up to ${FIXED_NUM_THUMBNAILS} video(s) for inspiration.`;
    return `You can select ${remaining} more video(s). ${selectedInspirations.length} selected.`;
  };


  return (
    <>
    <div className="flex flex-col md:flex-row h-screen max-h-screen overflow-hidden bg-[#23243A]" style={{ backgroundImage: 'radial-gradient(ellipse at 50% 0%, #FF9900 0%, #FF3366 40%, #8B5CF6 80%, #23243A 100%)' }}>
      {/* Left Column: Chat Interface */}
      <div className="w-full md:w-2/5 lg:w-1/3 flex flex-col bg-black/95 h-full relative p-[2px]">
        <div className="absolute inset-0 rounded-none pointer-events-none" style={{
          background: 'linear-gradient(90deg, var(--brand-gradient-from), var(--brand-gradient-via), var(--brand-gradient-to))',
          opacity: 0.5,
          zIndex: 0
        }} />
        <div className="relative flex flex-col h-full bg-black/95 z-10">
          <div className="p-4 flex items-center justify-between sticky top-0 bg-black/95 backdrop-blur-md z-10">
            <div className="flex items-center gap-2">
              <AppLogo baseSize={8} withText={true}/>
            </div>
            <Button 
              variant="ghost" 
              size="sm" 
              onClick={handleStartOver} 
              disabled={isProcessing || currentStep === 'generating'} 
              className="text-white hover:bg-gradient-to-r hover:from-[var(--brand-gradient-from)] hover:via-[var(--brand-gradient-via)] hover:to-[var(--brand-gradient-to)] transition-all duration-200"
            >
              <RefreshCw className="mr-2 h-4 w-4"/> Start Over
            </Button>
          </div>
          <div className="h-[1px] w-full bg-gradient-to-r from-[var(--brand-gradient-from)] via-[var(--brand-gradient-via)] to-[var(--brand-gradient-to)] opacity-50" />
          <div className="flex flex-col flex-grow h-0 min-h-0 bg-black/95">
            <ScrollArea className="flex-grow p-4 space-y-4 bg-black/95 [&_[data-radix-scroll-area-viewport]]:bg-black/95 [&_[data-radix-scroll-area-thumb]]:bg-gradient-to-b [&_[data-radix-scroll-area-thumb]]:from-[var(--brand-gradient-from)] [&_[data-radix-scroll-area-thumb]]:via-[var(--brand-gradient-via)] [&_[data-radix-scroll-area-thumb]]:to-[var(--brand-gradient-to)] [&_[data-radix-scroll-area-thumb]]:w-1.5 [&_[data-radix-scroll-area-thumb]]:rounded-full [&_[data-radix-scroll-area-thumb]]:opacity-50 hover:[&_[data-radix-scroll-area-thumb]]:opacity-80 [&_[data-radix-scroll-area-thumb]]:transition-opacity" ref={chatScrollRef}>
              {chatMessages.map((msg, index) => (
                <div
                  key={msg.id}
                  className={cn(
                    "flex mb-3 animate-fade-in",
                    msg.sender === "user" ? "justify-end" : "justify-start",
                    msg.sender === "system" && "justify-center"
                  )}
                  style={{ animationDelay: `${index * 50}ms` }}
                >
                  <div
                    className={cn(
                      "max-w-[80%] p-3 rounded-2xl shadow-lg transition-all duration-300",
                      msg.sender === "user" 
                        ? "bg-gradient-to-r from-[var(--brand-gradient-from)] via-[var(--brand-gradient-via)] to-[var(--brand-gradient-to)] text-white rounded-br-none hover:shadow-[var(--brand-gradient-to)]/20" 
                        : msg.sender === "bot" && msg.type === "error" 
                          ? "bg-black/80 text-white rounded-bl-none border border-[var(--brand-gradient-from)] hover:border-[var(--brand-gradient-to)]" 
                          : msg.sender === "bot" 
                            ? "bg-[#23243A] text-white rounded-bl-none hover:bg-[#2a2b45]" 
                            : "bg-black/40 text-white/70 text-xs italic text-center w-full max-w-md backdrop-blur-sm border border-white/5 hover:border-white/10"
                    )}
                  >
                    {msg.sender === "bot" && msg.type !== "loading" && msg.type !== "error" && (
                      <div className="flex items-center gap-1.5 mb-2">
                        <span className="inline-block align-middle">
                          <AppLogo baseSize={6} withText={false} />
                        </span>
                        <span className="text-xs font-medium text-primary/90">ThumbBlitz AI</span>
                      </div>
                    )}
                    {msg.sender === "user" && (
                      <div className="flex items-center gap-1.5 mb-2">
                        <User className="h-5 w-5 text-white/90" />
                        <span className="text-xs font-medium text-white/90">You</span>
                      </div>
                    )}
                    <div className="flex-1">
                      {msg.type === "loading" ? (
                        <div className="flex items-center gap-2">
                          <Loader2 className="h-5 w-5 animate-spin text-[var(--brand-gradient-to)]" />
                          <span className="text-sm break-words whitespace-pre-wrap">{msg.content}</span>
                        </div>
                      ) : (
                        <span className={cn(
                          "text-sm break-words whitespace-pre-wrap",
                          msg.sender === "system" && "flex items-center justify-center gap-2"
                        )}>
                          {msg.sender === "system" && <Sparkles className="h-4 w-4 text-[var(--brand-gradient-to)]" />}
                          {msg.content}
                        </span>
                      )}
                      {msg.sender !== "system" && (
                        <p className={cn(
                          "text-xs mt-2",
                          msg.sender === "user" 
                            ? "text-white/70 text-right" 
                            : "text-white/50 text-left"
                        )}>
                          {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              ))}
              {isTyping && <TypingAnimation />}
            </ScrollArea>
            {currentStep !== "generating" && currentStep !== "results" && !isTransitioning && (
              <div className="sticky bottom-0 left-0 right-0 z-20 bg-black/95 p-3 pt-0 border-t border-black/20 shadow-xl backdrop-blur-md">
                {renderCurrentStepInput()}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Right Column: Preview & Controls */}
      <div className="w-full md:w-3/5 lg:w-2/3 flex flex-col p-2 sm:p-4 md:p-6 bg-[#23243A] h-full overflow-y-auto relative">
        <div className="absolute inset-0 pointer-events-none" style={{
          background: 'linear-gradient(90deg, var(--brand-gradient-from), var(--brand-gradient-via), var(--brand-gradient-to))',
          opacity: 0.1,
          zIndex: 0
        }} />
        <div className="relative z-10">
          <div className="flex items-center justify-end mb-4">
            <div className="text-right">
              <p className="text-xs text-white/60">Content Title:</p>
              <h1 className="text-xl font-extrabold bg-gradient-to-r from-[var(--brand-gradient-from)] via-[var(--brand-gradient-via)] to-[var(--brand-gradient-to)] bg-clip-text text-transparent truncate max-w-xs sm:max-w-md md:max-w-lg" title={title}>{title}</h1>
            </div>
          </div>
          <div className="flex-grow grid grid-cols-1 sm:grid-cols-2 gap-4 items-center justify-center">
            {thumbnailUrls.map((url, index) => (
              <Card key={index} className="aspect-[16/9] relative group/thumb overflow-hidden rounded-2xl border border-black bg-black flex items-center justify-center transition-all duration-300 hover:scale-[1.03] cursor-pointer p-0 group hover:border-2 hover:border-transparent hover:bg-black hover:bg-clip-padding hover:[background-origin:border-box] hover:[position:relative]">
                <span className="pointer-events-none absolute inset-0 rounded-2xl z-10 opacity-0 group-hover:opacity-100 transition-opacity duration-200" style={{
                  border: '2px solid transparent',
                  background: 'linear-gradient(90deg, #FF9900, #FF3366, #8B5CF6) border-box',
                  WebkitMask: 'linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0)',
                  WebkitMaskComposite: 'xor',
                  maskComposite: 'exclude',
                }} />
                {isProcessing && currentStep === "generating" && !url && (
                  <div className="flex flex-col items-center text-muted-foreground">
                    <Loader2 className="h-8 w-8 animate-spin text-primary mb-2" />
                    <span className="text-xs">Generating {index + 1}...</span>
                  </div>
                )}
                {!isProcessing && !url && !generationError && (
                  <ImageIcon className="h-12 w-12 text-muted-foreground/30" data-ai-hint="placeholder image" />
                )}
                {url && !url.startsWith("data:image/svg+xml") && ( 
                  <Image src={url} alt={`Generated thumbnail ${index + 1}`} layout="fill" objectFit="contain" className="transition-transform duration-300 group-hover/thumb:scale-105" data-ai-hint="generated image" />
                )}
                {url && !url.startsWith("data:image/svg+xml") && (
                  <Button onClick={() => handleDownload(url, index)} size="icon" variant="ghost" className="absolute top-1.5 right-1.5 bg-black/40 hover:bg-black/60 text-white opacity-0 group-hover/thumb:opacity-100 transition-opacity h-7 w-7 z-10">
                    <Download className="h-3.5 w-3.5" />
                  </Button>
                )}
              </Card>
            ))}
          </div>

          {generationError && (
            <div className="mt-4 p-3 bg-destructive/10 border border-destructive/30 rounded-md text-destructive text-sm">
              <AlertTriangle className="h-5 w-5 inline mr-2" />
              <strong>Generation Error:</strong> {generationError}
            </div>
          )}

          {(currentStep === "results" || generationError) && !isProcessing && (
            <div className="mt-6 flex justify-end">
              <Button onClick={handleRegenerate} variant="outline" size="lg" disabled={isProcessing}>
                <RefreshCw className="mr-2 h-5 w-5" /> Regenerate Thumbnails
              </Button>
            </div>
          )}
        </div>
      </div>


      {/* YouTube Inspiration Modal */}
       <Dialog open={showYouTubeModal} onOpenChange={(open) => { if (!open) { setShowYouTubeModal(false); if (currentStep === "inspirationVideo") { handleInspirationChoice("skip"); } }}}>
          <DialogContent className="max-w-4xl h-[calc(100vh-4rem)] sm:h-[85vh] flex flex-col p-0 shadow-2xl">
            <DialogHeader className="p-6 pb-4 border-b sticky top-0 bg-background z-10">
              <DialogTitle className="text-2xl flex items-center gap-2">
                <Youtube className="h-7 w-7 text-red-500" /> 
                Choose Inspiration(s) from YouTube
              </DialogTitle>
              <DialogDescription>
                {getInspirationSelectionMessage()} Videos related to "{currentYoutubeSearchQuery || title || 'your content'}" are shown.
              </DialogDescription>
            </DialogHeader>

            {(isFetchingYouTubeVideos && youtubeVideos.length === 0) && (
              <div className="flex-grow flex flex-col items-center justify-center p-6">
                <Loader2 className="h-12 w-12 animate-spin text-primary mb-4" />
                <p className="text-lg text-muted-foreground">Searching YouTube for inspiration...</p>
              </div>
            )}
            
            {youtubeSearchError && !isFetchingYouTubeVideos && youtubeVideos.length === 0 && (
                 <div className="p-4 text-center bg-destructive/10 border-b border-destructive/30">
                    <div className="flex items-center justify-center mb-2">
                        <XCircle className="h-6 w-6 text-destructive mr-2" />
                        <p className="text-md font-semibold text-destructive">YouTube Search Issue</p>
                    </div>
                    <p className="text-sm text-destructive/90 whitespace-pre-wrap">{youtubeSearchError}</p>
                 </div>
            )}
            
            {(!isFetchingYouTubeVideos || youtubeVideos.length > 0) && youtubeVideos.length > 0 && (
              <ScrollArea className="flex-grow p-6 pt-2"> 
                {isShowingMockData && (
                     <div className="mb-4 p-3 bg-gradient-to-r from-[var(--brand-gradient-from)] via-[var(--brand-gradient-via)] to-[var(--brand-gradient-to)]/10 border border-[var(--brand-gradient-to)]/30 rounded-md text-center">
                        <AppLogo baseSize={6} withText={false} className="inline mr-2 align-middle" />
                        <span className="text-sm font-medium text-white">
                           Displaying MOCK (placeholder) videos. These are NOT relevant to your title due to a YouTube API configuration issue.
                        </span>
                    </div>
                )}
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                  {youtubeVideos.map((video, index) => {
                    const isSelected = selectedInspirations.some(insp => insp.id === video.id);
                    return (
                    <Card 
                      key={`${video.id}-${index}`} 
                      className={cn(
                        "cursor-pointer hover:shadow-xl transition-all duration-200 group bg-black overflow-hidden flex flex-col relative rounded-2xl border border-[#35364A]",
                        isSelected ? 'ring-2 ring-primary shadow-xl border-primary' : 'hover:ring-2 hover:ring-primary/70',
                        (selectedInspirations.length >= FIXED_NUM_THUMBNAILS && !isSelected) ? "opacity-60 cursor-not-allowed hover:ring-0" : ""
                      )}
                      onClick={() => {
                        if (selectedInspirations.length < FIXED_NUM_THUMBNAILS || isSelected) {
                           handleToggleInspirationSelection(video)
                        } else {
                            toast({title: "Inspiration Limit Reached", description: `You can only select up to ${FIXED_NUM_THUMBNAILS} inspiration(s).`, variant: "default"})
                        }
                      }}
                      data-ai-hint="video thumbnail"
                    >
                      {isSelected && (
                        <div className="absolute top-2 right-2 z-20 bg-primary text-primary-foreground rounded-full p-1 shadow-lg">
                          <CheckCircle className="h-5 w-5" />
                        </div>
                      )}
                      <CardContent className="p-0 flex flex-col flex-grow">
                        <div className="relative aspect-video w-full overflow-hidden">
                          <Image src={video.thumbnailUrl} alt={video.title} layout="fill" objectFit="cover" className={`group-hover:scale-105 transition-transform duration-300 ${isShowingMockData ? 'filter grayscale blur-sm' : ''}`} />
                           <div className={cn("absolute inset-0 bg-gradient-to-t from-black/70 via-black/30 to-transparent group-hover:from-black/50 transition-all flex items-end justify-start p-2", isSelected ? '!bg-primary/30 from-primary/50' : '')}>
                                {isSelected && <ListChecks className="h-8 w-8 text-white/90 transform scale-100 transition-transform duration-300 ease-out"/>}
                           </div>
                        </div>
                        <div className="p-3 space-y-1 flex-grow flex flex-col justify-between">
                          <div>
                            <h3 className={`font-semibold text-sm line-clamp-2 leading-tight ${isSelected ? 'text-primary' : 'text-foreground group-hover:text-primary'}`}>{video.title}</h3>
                            <p className="text-xs text-muted-foreground line-clamp-1">{video.channelTitle}</p>
                          </div>
                          <p className="text-xs text-muted-foreground mt-1">{video.viewCount} views</p>
                        </div>
                      </CardContent>
                    </Card>
                  )})}
                </div>
                 {youtubeNextPageToken && !isFetchingMoreYouTubeVideos && (
                  <div className="mt-6 flex justify-center">
                    <Button onClick={handleLoadMoreYoutubeVideos} variant="outline" className="text-primary border-primary/50 hover:border-primary hover:bg-primary/10">
                      <PlusCircle className="mr-2 h-5 w-5" /> Load More Videos
                    </Button>
                  </div>
                )}
                {isFetchingMoreYouTubeVideos && (
                  <div className="mt-6 flex justify-center">
                    <Loader2 className="h-8 w-8 animate-spin text-primary" />
                  </div>
                )}
              </ScrollArea>
            )}

            {(!isFetchingYouTubeVideos && !isFetchingMoreYouTubeVideos) && !youtubeSearchError && youtubeVideos.length === 0 && (
                 <div className="flex-grow flex flex-col items-center justify-center p-6 text-center">
                    <Search className="h-12 w-12 text-muted-foreground/50 mb-4" />
                    <p className="text-lg font-semibold text-muted-foreground">No Videos Found</p>
                    <p className="text-sm text-muted-foreground/80">Try adjusting your content title for better inspiration results or skip this step.</p>
                 </div>
            )}

            <DialogFooter className="p-4 border-t flex-shrink-0 bg-background/95 backdrop-blur-sm sticky bottom-0 z-10 items-center justify-between sm:justify-end space-x-2"> 
              <Button variant="ghost" onClick={handleSkipInspirationFromModal} disabled={isProcessing}>
                Skip Inspiration
              </Button>
              <div className="flex items-center space-x-2">
                <Button variant="outline" onClick={() => {setShowYouTubeModal(false); if (currentStep === "inspirationVideo") { handleInspirationChoice("skip"); } }} disabled={isProcessing}>
                  Cancel
                </Button>
                <Button onClick={handleConfirmYouTubeSelections} disabled={isProcessing} className="bg-primary hover:bg-primary/90 text-primary-foreground">
                  {selectedInspirations.length > 0 ? `Use ${selectedInspirations.length} Inspiration(s)` : 'Continue Without Inspiration'}
                </Button>
              </div>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Adjust Inspiration Modal */}
        <Dialog open={showInspirationLevelModal} onOpenChange={(open) => { 
            if (!open) { 
                setShowInspirationLevelModal(false); 
                if (selectedInspirations.length > 0 && currentStep === "adjustInspiration") {
                    setShowYouTubeModal(true); 
                } else if (currentStep === "adjustInspiration") { 
                     handleInspirationChoice("skip"); 
                }
            }
        }}>
          <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col shadow-2xl">
            <DialogHeader className="p-6 pb-4 border-b">
              <DialogTitle className="flex items-center gap-2 text-xl">
                <SlidersHorizontal className="h-6 w-6 text-primary" />
                Adjust Inspiration Details ({selectedInspirations.length} selected)
              </DialogTitle>
                <DialogDescription>
                  Set visual influence, and decide whether to replicate faces or text from inspirations.
                </DialogDescription>
            </DialogHeader>
            
            <ScrollArea className="flex-grow -mx-6 px-6 py-1">
              <div className="space-y-6 py-4">
              {selectedInspirations.map((inspiration, index) => (
                <Card key={inspiration.id} className="overflow-hidden bg-card/70 border-border/50">
                  <CardContent className="p-4 flex flex-col gap-4">
                    <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
                        <div className="relative aspect-video w-full sm:w-36 sm:h-auto shrink-0 overflow-hidden rounded-md border bg-muted/10">
                        <Image src={inspiration.video.thumbnailUrl} alt={`Inspiration: ${inspiration.video.title}`} layout="fill" objectFit="cover" />
                        </div>
                        <div className="flex-grow w-full space-y-2">
                          <p className="text-sm font-semibold text-foreground/90 line-clamp-1">
                            Image {index + 1}: <span className="font-normal text-muted-foreground">{inspiration.video.title}</span>
                          </p>
                          <Label htmlFor={`inspirationLevelModalSlider-${index}`} className="text-xs font-medium text-foreground/80">
                              Visual Influence: <span className="font-bold text-primary">{inspiration.level}%</span>
                          </Label>
                          <Slider
                              id={`inspirationLevelModalSlider-${index}`}
                              value={[inspiration.level]}
                              min={20}
                              max={100}
                              step={20}
                              onValueChange={(value) => handleUpdateInspirationLevel(inspiration.id, value[0])}
                              className="w-full mt-1 [&>span:first-child_div]:bg-primary [&>span:last-child]:border-primary [&>span:last-child]:bg-background"
                              disabled={isProcessing}
                          />
                        </div>
                        <Button 
                            variant="ghost" 
                            size="icon" 
                            className="text-muted-foreground hover:text-destructive absolute top-2 right-2 sm:static sm:ml-auto shrink-0 h-7 w-7"
                            onClick={() => setSelectedInspirations(prev => prev.filter(si => si.id !== inspiration.id))}
                            aria-label="Remove inspiration"
                            disabled={isProcessing}
                        >
                            <X className="h-4 w-4" />
                        </Button>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-3 pt-3 border-t border-border/30">
                        <div className="flex items-center space-x-2">
                            <Switch
                                id={`useSameFace-${inspiration.id}-${index}`} 
                                checked={inspiration.useSameFace}
                                onCheckedChange={(checked) => handleUpdateInspirationToggles(inspiration.id, 'useSameFace', checked)}
                                disabled={isProcessing}
                                className="data-[state=checked]:bg-primary"
                            />
                            <Label htmlFor={`useSameFace-${inspiration.id}-${index}`} className="text-xs flex items-center gap-1.5 cursor-pointer text-foreground/80">
                                <UserCheck className="h-4 w-4 text-primary/80" /> Replicate Face
                            </Label>
                        </div>
                        <div className="flex items-center space-x-2">
                            <Switch
                                id={`useSameText-${inspiration.id}-${index}`} 
                                checked={inspiration.useSameText}
                                onCheckedChange={(checked) => handleUpdateInspirationToggles(inspiration.id, 'useSameText', checked)}
                                disabled={isProcessing}
                                className="data-[state=checked]:bg-primary"
                            />
                            <Label htmlFor={`useSameText-${inspiration.id}-${index}`} className="text-xs flex items-center gap-1.5 cursor-pointer text-foreground/80">
                                <Type className="h-4 w-4 text-primary/80" /> Replicate Text
                            </Label>
                        </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
              </div>
            </ScrollArea>
            {selectedInspirations.length === 0 && (
                <div className="flex-grow flex flex-col items-center justify-center text-center py-8">
                    <ImageIcon className="h-10 w-10 text-muted-foreground/50 mb-3" />
                    <p className="text-sm text-muted-foreground">No inspirations selected.</p>
                    <p className="text-xs text-muted-foreground/80">Go back to select some, or proceed to Master Text.</p>
                </div>
            )}

            <DialogFooter className="p-4 border-t mt-auto flex-shrink-0">
              <Button variant="outline" onClick={() => { 
                setShowInspirationLevelModal(false); 
                setShowYouTubeModal(true); 
              }} disabled={isProcessing}>
                Back to YouTube Results
              </Button>
              <Button onClick={handleConfirmInspirationAndProceed} disabled={isProcessing} className="bg-primary hover:bg-primary/90 text-primary-foreground">
                Confirm & Continue
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

    </div>
    </>
  );
}


// Wrap with Suspense for useSearchParams
export default function GeneratorChatPage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center h-screen"><Loader2 className="h-12 w-12 animate-spin text-primary" /></div>}>
      <GeneratorChatPageInternal />
    </Suspense>
  );
}


    
