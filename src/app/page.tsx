"use client";

import * as React from "react";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { AppLogo } from "@/components/icons/AppLogo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { searchYouTubeVideos, YouTubeVideo, getMockYouTubeVideos, fetchUploadsPlaylistVideos } from "@/services/youtube";
import { ArrowRight, Paperclip, Globe, Eye, Users, Star, ChevronRight, Loader2 } from "lucide-react";

const formSchema = z.object({
  title: z.string().min(3, { message: "Title must be at least 3 characters." }).max(100, { message: "Title can be at most 100 characters." }),
});

type FormValues = z.infer<typeof formSchema>;

const TAGS = [
  "AI image generator",
  "Hacker News top 100",
  "3D product viewer",
  "Recharts dashboard",
  "YouTube thumbnail",
  "Podcast cover",
];

const YOUTUBE_API_KEY = "AIzaSyD1JG9hr3ciY8QP1StCmYjByVd3LyBIaRw"; // Use your key
const SHOWCASE_QUERIES = [
  { label: "Community Thumbnails", query: "trending" },
  { label: "Top Thumbnails", query: "most viewed" },
];

// Typing animation for placeholder
const PLACEHOLDER_TITLES = [
  "Epic Gaming Montage",
  "Latest Tech Unboxing",
  "Breaking News: AI Revolution",
  "Reacting to Viral Videos",
  "Top 10 Movie Trailers",
  "How to Cook Perfect Pasta",
  "Daily Vlog: My Morning Routine",
  "Live Music Performance",
  "Travel Guide: Japan",
  "Fitness Challenge: 30 Days"
];

export default function LandingPage() {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [activeTab, setActiveTab] = useState(0);
  const [showcase, setShowcase] = useState<YouTubeVideo[][]>([[], []]);
  const [loadingShowcase, setLoadingShowcase] = useState([true, true]);
  const [errorShowcase, setErrorShowcase] = useState<(string | null)[]>([null, null]);

  // Typing animation state
  const [placeholder, setPlaceholder] = useState("");
  const [typingIndex, setTypingIndex] = useState(0);
  const [charIndex, setCharIndex] = useState(0);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isInputFocused, setIsInputFocused] = useState(false);

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: { title: "" },
    mode: "onChange",
  });

  const onSubmit = (values: FormValues) => {
    setIsLoading(true);
    router.push(`/generate?title=${encodeURIComponent(values.title)}`);
  };

  // Typing/deleting effect for animated placeholder
  useEffect(() => {
    if (isInputFocused || form.watch("title")) {
      setPlaceholder("");
      return;
    }
    const currentTitle = PLACEHOLDER_TITLES[typingIndex];
    let timeout: NodeJS.Timeout;
    if (!isDeleting && charIndex < currentTitle.length) {
      timeout = setTimeout(() => {
        setCharIndex((c) => c + 1);
        setPlaceholder(currentTitle.slice(0, charIndex + 1));
      }, 60);
    } else if (!isDeleting && charIndex === currentTitle.length) {
      timeout = setTimeout(() => setIsDeleting(true), 1200);
    } else if (isDeleting && charIndex > 0) {
      timeout = setTimeout(() => {
        setCharIndex((c) => c - 1);
        setPlaceholder(currentTitle.slice(0, charIndex - 1));
      }, 30);
    } else if (isDeleting && charIndex === 0) {
      timeout = setTimeout(() => {
        setIsDeleting(false);
        setTypingIndex((i) => (i + 1) % PLACEHOLDER_TITLES.length);
      }, 400);
    }
    return () => clearTimeout(timeout);
  }, [charIndex, isDeleting, typingIndex, isInputFocused, form.watch("title")]);

  // Fetch showcase thumbnails from YouTube API
  useEffect(() => {
    SHOWCASE_QUERIES.forEach(async (tab, idx) => {
      setLoadingShowcase((prev) => prev.map((v, i) => (i === idx ? true : v)));
      try {
        const { videos } = await searchYouTubeVideos(tab.query, YOUTUBE_API_KEY, 8);
        setShowcase((prev) => {
          const next = [...prev];
          next[idx] = videos;
          return next;
        });
        setErrorShowcase((prev) => prev.map((v, i) => (i === idx ? null : v)));
      } catch (e) {
        const { videos } = await getMockYouTubeVideos();
        setShowcase((prev) => {
          const next = [...prev];
          next[idx] = videos;
          return next;
        });
        setErrorShowcase((prev) => prev.map((v, i) => (i === idx ? "API error" : v)));
      } finally {
        setLoadingShowcase((prev) => prev.map((v, i) => (i === idx ? false : v)));
      }
    });
  }, []);

  // Fetch thumbnails from the channel '@dineshcreationzz' for 'Your Thumbnails'
  const [yourThumbnails, setYourThumbnails] = useState<YouTubeVideo[]>([]);
  const [loadingYourThumbnails, setLoadingYourThumbnails] = useState(true);
  const [errorYourThumbnails, setErrorYourThumbnails] = useState<string | null>(null);

  useEffect(() => {
    async function fetchChannelThumbs() {
      setLoadingYourThumbnails(true);
      setErrorYourThumbnails(null);
      try {
        const videos = await fetchUploadsPlaylistVideos("UCtl01qyeHagib--JpJj4OIw", 8);
        setYourThumbnails(videos);
      } catch (e) {
        setErrorYourThumbnails("Could not load thumbnails from @dineshcreationzz");
        setYourThumbnails([]);
      } finally {
        setLoadingYourThumbnails(false);
      }
    }
    fetchChannelThumbs();
  }, []);

  return (
    <div className="min-h-screen flex flex-col bg-[#181C2A]">
      {/* Header & Hero */}
      <header className="fixed top-0 left-0 w-full z-30 px-0">
        <div className="w-full flex justify-between items-center px-8 py-4 bg-black/60 backdrop-blur-md border-b border-white/10 shadow-sm rounded-b-2xl">
          <div className="flex items-center gap-4">
            <AppLogo baseSize={10} withText={true} />
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" className="rounded-md px-5 py-2 text-base font-medium text-white hover:bg-white/10">Sign in</Button>
            <Button className="rounded-md px-5 py-2 text-base font-semibold bg-gradient-to-r from-[var(--brand-gradient-from)] via-[var(--brand-gradient-via)] to-[var(--brand-gradient-to)] text-white border-none shadow-md hover:brightness-110">Sign up</Button>
          </div>
        </div>
        </header>
      <div className="pt-[128px]">
        <div className="max-w-2xl mx-auto text-center">
          <h1 className="text-4xl sm:text-5xl md:text-6xl font-extrabold tracking-tight text-white mb-4">Blitz a Thumbnail using <span className="bg-gradient-to-r from-[var(--brand-gradient-from)] via-[var(--brand-gradient-via)] to-[var(--brand-gradient-to)] bg-clip-text text-transparent inline-flex items-center gap-2">ThumbBlitz AI <span className='align-middle inline-block'><AppLogo baseSize={12} withText={false} /></span></span></h1>
          <p className="text-lg sm:text-xl text-white/80 mb-8">Blitz your next viral thumbnail in seconds with fast, AI-powered design. No design skills needed—just your idea!</p>
          <form onSubmit={form.handleSubmit(onSubmit)} className="mx-auto max-w-3xl">
            <div className="bg-black/70 rounded-3xl shadow-2xl px-8 pt-7 pb-4 flex flex-col min-h-[180px] relative backdrop-blur-md border border-white/10">
              <textarea
                {...form.register('title')}
                value={form.watch('title')}
                onFocus={() => setIsInputFocused(true)}
                onBlur={() => setIsInputFocused(false)}
                placeholder=" "
                className="w-full bg-transparent text-white text-2xl font-medium placeholder:text-gray-200 outline-none resize-none border-none min-h-[60px] max-h-[180px] focus:ring-0 focus:outline-none mb-2"
                rows={2}
                          disabled={isLoading}
                          autoFocus
                        />
              {/* Animated placeholder overlay */}
              {!(form.watch('title') || isInputFocused) && (
                <span className="absolute left-8 top-7 pointer-events-none select-none text-gray-200 text-2xl font-medium" style={{fontFamily: 'inherit'}}>
                  {placeholder}&nbsp;
                </span>
              )}
              <div className="flex items-end justify-between mt-4">
                <Button type="button" variant="ghost" className="flex items-center gap-2 text-white font-bold px-0 py-0 hover:bg-white/10 focus:bg-white/10">
                  <Paperclip className="h-5 w-5 mr-1" /> Attach
                </Button>
                <div className="flex items-center gap-3">
                  <Button type="button" variant="ghost" className="flex items-center gap-2 text-white font-bold px-0 py-0 hover:bg-white/10 focus:bg-white/10">
                    <Globe className="h-5 w-5 mr-1" /> Public
                  </Button>
                  <button
                  type="submit"
                    className="ml-2 flex items-center justify-center rounded-full bg-gradient-to-r from-[var(--brand-gradient-from)] via-[var(--brand-gradient-via)] to-[var(--brand-gradient-to)] transition shadow-lg w-24 h-12 disabled:opacity-60 disabled:cursor-not-allowed text-white font-bold text-lg border-none"
                  disabled={isLoading || !form.formState.isValid}
                  aria-live="polite"
                  >
                    {isLoading ? <Loader2 className="animate-spin h-7 w-7 text-white" /> : "Blitz!"}
                  </button>
                </div>
              </div>
            </div>
          </form>
          <div className="flex flex-wrap justify-center gap-2 mt-6">
            {["2-Minute Thumbnails", "Easy AI Chat Flow", "Fast & Affordable", "Simple & Sweet", "No Design Skills Needed", "1-Click Blitz!"].map((tag) => (
              <span
                key={tag}
                className="bg-[#23243A] border border-[#35364A] text-gray-300 px-3 py-1.5 rounded-full text-xs font-medium cursor-pointer transition-colors duration-200 hover:bg-[#23243A] hover:text-transparent hover:bg-clip-text hover:bg-gradient-to-r hover:from-[var(--brand-gradient-from)] hover:via-[var(--brand-gradient-via)] hover:to-[var(--brand-gradient-to)]"
              >
                {tag}
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* Showcase Section */}
      <section className="w-full max-w-7xl mx-auto px-4 mt-6 z-10 relative">
        <div className="bg-black/70 rounded-3xl shadow-2xl p-6 sm:p-10 border border-white/10 backdrop-blur-md">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-2xl font-bold text-white">Blitzed by the Community</h2>
            <div className="flex gap-2">
              {["Your Thumbnails", ...SHOWCASE_QUERIES.map((q) => q.label)].map((tab, idx) => (
                <button
                  key={tab}
                  className={`px-4 py-2 rounded-lg text-sm font-semibold transition 
                    ${activeTab === idx
                      ? "bg-gradient-to-r from-[var(--brand-gradient-from)] via-[var(--brand-gradient-via)] to-[var(--brand-gradient-to)] text-white shadow-md border-none"
                      : "bg-[#23243A] text-gray-300 hover:bg-black/60 hover:text-transparent hover:bg-clip-padding hover:bg-gradient-to-r hover:from-[var(--brand-gradient-from)] hover:via-[var(--brand-gradient-via)] hover:to-[var(--brand-gradient-to)] hover:bg-clip-text hover:text-transparent"}
                  `}
                  onClick={() => setActiveTab(idx)}
                >
                  {tab}
                </button>
              ))}
            </div>
            <Button variant="ghost" className="flex items-center gap-1 text-sm font-semibold bg-clip-text text-transparent bg-gradient-to-r from-[var(--brand-gradient-from)] via-[var(--brand-gradient-via)] to-[var(--brand-gradient-to)] border-none shadow-none hover:bg-gradient-to-r hover:from-[var(--brand-gradient-from)] hover:via-[var(--brand-gradient-via)] hover:to-[var(--brand-gradient-to)] hover:text-white">View All <ChevronRight className="h-4 w-4" /></Button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
            {/* Your Thumbnails */}
            {activeTab === 0 && (
              loadingYourThumbnails ? (
                <div className="col-span-full flex items-center justify-center py-12">
                  <Loader2 className="h-10 w-10 animate-spin text-[var(--brand-gradient-to)]" />
                </div>
              ) : errorYourThumbnails ? (
                <div className="col-span-full flex flex-col items-center justify-center py-12 text-gray-400">
                  <Eye className="h-10 w-10 mb-2" />
                  <p className="text-lg font-semibold">{errorYourThumbnails}</p>
                </div>
              ) : yourThumbnails.length === 0 ? (
                <div className="col-span-full flex flex-col items-center justify-center py-12 text-gray-400">
                  <Eye className="h-10 w-10 mb-2" />
                  <p className="text-lg font-semibold">No thumbnails yet</p>
                  <p className="text-sm">Blitz your first thumbnail above!</p>
                </div>
              ) : (
                yourThumbnails.map((thumb) => (
                  <ShowcaseCard key={thumb.id} video={thumb} />
                ))
              )
            )}
            {/* Community/Top Thumbnails */}
            {activeTab > 0 && (
              loadingShowcase[activeTab - 1] ? (
                <div className="col-span-full flex items-center justify-center py-12">
                  <Loader2 className="h-10 w-10 animate-spin text-[var(--brand-gradient-to)]" />
                </div>
              ) : (
                showcase[activeTab - 1].map((video) => (
                  <ShowcaseCard key={video.id} video={video} />
                ))
              )
            )}
          </div>
          <div className="flex justify-center mt-8">
            <Button variant="outline" className="rounded-full border-2 border-transparent bg-[#23243A] px-8 py-3 font-semibold text-lg text-transparent bg-clip-text bg-gradient-to-r from-[var(--brand-gradient-from)] via-[var(--brand-gradient-via)] to-[var(--brand-gradient-to)] hover:text-white hover:bg-gradient-to-r hover:from-[var(--brand-gradient-from)] hover:via-[var(--brand-gradient-via)] hover:to-[var(--brand-gradient-to)] hover:bg-clip-padding hover:border-[var(--brand-gradient-to)]">Show More Blitzes</Button>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="mt-24 py-16 px-4 bg-black">
        <div className="max-w-7xl mx-auto grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-8 text-gray-400">
          <div>
            <div className="flex items-center gap-2 mb-4 whitespace-nowrap">
              <AppLogo baseSize={10} withText={true} />
            </div>
            <p className="text-base font-semibold text-white">Blitz thumbnails in seconds with AI. Fast, easy, and viral-ready!</p>
          </div>
          <div>
            <h4 className="font-semibold text-white mb-2">Company</h4>
            <ul className="space-y-1 text-sm">
              <li>Blog</li>
              <li>Careers</li>
            </ul>
          </div>
          <div>
            <h4 className="font-semibold text-white mb-2">Product</h4>
            <ul className="space-y-1 text-sm">
              <li>Import from Figma</li>
              <li>Roadmap</li>
              <li>Status</li>
              <li>Changelog</li>
              <li>Pricing</li>
              <li>Solutions</li>
              <li>Hire a Partner</li>
              <li>Become a Partner</li>
            </ul>
          </div>
          <div>
            <h4 className="font-semibold text-white mb-2">Resources</h4>
            <ul className="space-y-1 text-sm">
              <li>Launched</li>
              <li>Enterprise</li>
              <li>Learn</li>
              <li>Support</li>
              <li>Integrations</li>
              <li>Affiliates</li>
            </ul>
          </div>
          <div>
            <h4 className="font-semibold text-white mb-2">Socials</h4>
            <ul className="space-y-1 text-sm">
              <li>X / Twitter</li>
              <li>LinkedIn</li>
              <li>Discord</li>
              <li>Reddit</li>
            </ul>
          </div>
      </div>
      </footer>
    </div>
  );
}

// ShowcaseCard component for thumbnails
function ShowcaseCard({ video }: { video: YouTubeVideo }) {
  return (
    <Card className="relative bg-black border border-[#35364A] rounded-2xl overflow-hidden shadow-lg flex flex-col hover:scale-[1.03] transition-transform cursor-pointer p-0 group">
      {/* Gradient border on hover using a pseudo-element */}
      <span className="pointer-events-none absolute inset-0 rounded-2xl z-10 opacity-0 group-hover:opacity-100 transition-opacity duration-200" style={{
        border: '2px solid transparent',
        background: 'linear-gradient(90deg, #FF9900, #FF3366, #8B5CF6) border-box',
        WebkitMask: 'linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0)',
        WebkitMaskComposite: 'xor',
        maskComposite: 'exclude',
      }} />
      <img src={video.thumbnailUrl} alt={video.title} className="w-full aspect-video object-cover rounded-t-2xl z-20 relative" />
      <div className="p-4 flex flex-col flex-1 z-20 relative">
        <h3 className="text-white font-semibold text-base line-clamp-2 mb-1">{video.title}</h3>
        <div className="flex items-center gap-2 text-xs text-gray-400 mb-1">
          <Users className="h-4 w-4" />
          <span className="truncate">{video.channelTitle}</span>
        </div>
        <div className="flex items-center gap-2 text-xs text-gray-400">
          <Eye className="h-4 w-4" />
          <span>{video.viewCount} views</span>
        </div>
      </div>
    </Card>
  );
}

