export interface YouTubeVideo {
  id: string;
  title: string;
  thumbnailUrl: string;
  viewCount: string; 
  channelTitle: string;
}

export interface YouTubeSearchResponseItem {
  id: { videoId: string };
  snippet: {
    title: string;
    thumbnails: {
      medium: { url: string }; 
      high?: { url: string }; 
    };
    channelTitle: string;
  };
}

export interface YouTubeVideosResponseItem {
   id: string;
   snippet: {
    title: string;
    thumbnails: {
      medium: { url: string };
      high?: { url: string };
    };
    channelTitle: string;
  };
  statistics?: {
    viewCount: string;
  };
}

// Structure for the overall search API response to capture nextPageToken
export interface YouTubeAPISearchListResponse {
  nextPageToken?: string;
  items: YouTubeSearchResponseItem[];
  pageInfo?: {
    totalResults: number;
    resultsPerPage: number;
  };
}

export const YOUTUBE_API_KEYS = [
  "AIzaSyD1JG9hr3ciY8QP1StCmYjByVd3LyBIaRw",
  "AIzaSyAt8dpRN8IGCNaAc0AEq8miICsdOt3Lwo0"
];

const API_CONFIG_ERROR_PREFIX = "[API_CONFIG_ERROR]";

// Utility: Try each key in order until one works
export async function fetchWithYouTubeKeys<T>(fetcher: (key: string) => Promise<T>): Promise<T> {
  let lastError;
  for (const key of YOUTUBE_API_KEYS) {
    try {
      return await fetcher(key);
    } catch (e) {
      lastError = e;
      // If quota or auth error, try next key
      if (typeof e === 'object' && e && 'message' in e && typeof e.message === 'string') {
        if (
          e.message.includes('quota') ||
          e.message.includes('API key') ||
          e.message.includes('not enabled') ||
          e.message.includes('Invalid') ||
          e.message.includes('forbidden') ||
          e.message.includes('403')
        ) {
          continue;
        }
      }
      // For other errors, break
      break;
    }
  }
  throw lastError || new Error('All YouTube API keys failed');
}

// Utility to parse ISO8601 duration (e.g., PT1M30S)
function parseISO8601Duration(duration: string): number {
  // Returns duration in seconds
  const regex = /PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/;
  const matches = duration.match(regex);
  if (!matches) return 0;
  const hours = parseInt(matches[1] || '0', 10);
  const minutes = parseInt(matches[2] || '0', 10);
  const seconds = parseInt(matches[3] || '0', 10);
  return hours * 3600 + minutes * 60 + seconds;
}

// Filter out Shorts (videos under 60 seconds)
function filterOutShorts(videos: { id: string; duration?: string }[]): string[] {
  return videos.filter(v => v.duration && parseISO8601Duration(v.duration) >= 60).map(v => v.id);
}

export async function searchYouTubeVideos(
  query: string,
  _apiKey: string, // ignored, kept for compatibility
  maxResults: number = 6,
  pageToken?: string
): Promise<{ videos: YouTubeVideo[]; nextPageToken?: string }> {
  return fetchWithYouTubeKeys(async (apiKey) => {
    let searchApiUrl = `https://www.googleapis.com/youtube/v3/search?part=snippet&q=${encodeURIComponent(query)}&type=video&order=viewCount&maxResults=${maxResults}&key=${apiKey}`;
    if (pageToken) {
      searchApiUrl += `&pageToken=${pageToken}`;
    }
    let searchDataItems: YouTubeSearchResponseItem[];
    let nextPageTokenFromSearch: string | undefined;
    const searchResponse = await fetch(searchApiUrl);
    if (!searchResponse.ok) {
      const errorData = await searchResponse.json().catch(() => ({ error: { message: `Failed to parse error response from YouTube API (Search). Status: ${searchResponse.status}` } }));
      let uiMessage = `YouTube API search failed (status: ${searchResponse.status}).`;
      if (errorData.error && errorData.error.message) {
        const googleMsg = errorData.error.message;
        const googleMsgLower = googleMsg.toLowerCase();
        if (searchResponse.status === 400 && (googleMsgLower.includes("api key not valid") || googleMsgLower.includes("keyinvalid"))) {
          uiMessage = `${API_CONFIG_ERROR_PREFIX} Invalid YouTube API Key provided for search.`;
        } else if (searchResponse.status === 403 && (googleMsgLower.includes("youtube data api v3 has not been used") || googleMsgLower.includes("api not enabled") || googleMsgLower.includes("servicenotenabled") || googleMsgLower.includes("accessnotconfigured") || googleMsgLower.includes("projectnotlinked")  || googleMsgLower.includes("servicedisabled") || googleMsgLower.includes("quotaexceeded") || googleMsgLower.includes("billingnotenabled") || googleMsgLower.includes("youtube data api v3 is not enabled"))) {
          uiMessage = `${API_CONFIG_ERROR_PREFIX} The YouTube Data API v3 is not enabled for the project, is disabled, or has billing/quota issues. Original error: "${googleMsg}". Please check the Google Cloud Console.`;
        } else {
          uiMessage = `YouTube Search API Error: ${googleMsg}`; 
        }
      }
      throw new Error(uiMessage);
    }
    const searchData: YouTubeAPISearchListResponse = await searchResponse.json();
    searchDataItems = searchData.items || [];
    nextPageTokenFromSearch = searchData.nextPageToken;
    if (searchDataItems.length === 0) {
      return { videos: [], nextPageToken: undefined };
    }
    const videoIds = searchDataItems.map(item => item.id.videoId).join(',');
    if (!videoIds) return { videos: [], nextPageToken: nextPageTokenFromSearch };
    // Fetch durations as well
    const videosApiUrl = `https://www.googleapis.com/youtube/v3/videos?part=snippet,statistics,contentDetails&id=${videoIds}&key=${apiKey}`;
    const videosResponse = await fetch(videosApiUrl);
    if (!videosResponse.ok) {
      const errorData = await videosResponse.json().catch(() => ({ error: { message: `Failed to parse error response from YouTube API (Videos). Status: ${videosResponse.status}` } }));
      let uiMessage = `Fetching YouTube video details failed (status: ${videosResponse.status}).`;
      if (errorData.error && errorData.error.message) {
        const googleMsg = errorData.error.message;
        const googleMsgLower = googleMsg.toLowerCase();
        if (videosResponse.status === 400 && (googleMsgLower.includes("api key not valid") || googleMsgLower.includes("keyinvalid"))) {
          uiMessage = `${API_CONFIG_ERROR_PREFIX} Invalid YouTube API Key when fetching video details.`;
        } else if (videosResponse.status === 403 && (googleMsgLower.includes("youtube data api v3 has not been used") || googleMsgLower.includes("api not enabled") || googleMsgLower.includes("servicenotenabled") || googleMsgLower.includes("accessnotconfigured") || googleMsgLower.includes("projectnotlinked") || googleMsgLower.includes("servicedisabled") || googleMsgLower.includes("quotaexceeded") || googleMsgLower.includes("billingnotenabled") || googleMsgLower.includes("youtube data api v3 is not enabled"))) {
          uiMessage = `${API_CONFIG_ERROR_PREFIX} The YouTube Data API v3 is not enabled (or has quota/billing issues) for fetching video details. Original error: "${googleMsg}". Please check the Google Cloud Console.`;
        } else {
          uiMessage = `YouTube Videos API Error: ${googleMsg}`;
        }
      }
      throw new Error(uiMessage);
    }
    const videosData = await videosResponse.json();
    const videosDataItems: (YouTubeVideosResponseItem & { contentDetails?: { duration: string } })[] = videosData.items || [];
    // Filter out Shorts
    const filteredVideos = videosDataItems.filter(v => v.contentDetails && parseISO8601Duration(v.contentDetails.duration) >= 60);
    const videoMap = new Map(filteredVideos.map((video: any) => [video.id, video]));
    const resolvedVideos = searchDataItems
      .filter(item => videoMap.has(item.id.videoId))
      .map((item) => {
        const videoDetails = videoMap.get(item.id.videoId);
        return {
          id: item.id.videoId,
          title: item.snippet.title,
          thumbnailUrl: item.snippet.thumbnails.high?.url || item.snippet.thumbnails.medium.url,
          viewCount: videoDetails?.statistics?.viewCount ? formatViewCount(videoDetails.statistics.viewCount) : "N/A",
          channelTitle: item.snippet.channelTitle,
        };
      })
      .sort((a, b) => parseViewCount(b.viewCount) - parseViewCount(a.viewCount));
    return { videos: resolvedVideos, nextPageToken: nextPageTokenFromSearch };
  });
}

function formatViewCount(countStr: string): string {
  const count = parseInt(countStr, 10);
  if (isNaN(count)) return "0";
  if (count >= 1_000_000_000) return (count / 1_000_000_000).toFixed(1).replace(/\.0$/, '') + 'B';
  if (count >= 1_000_000) return (count / 1_000_000).toFixed(1).replace(/\.0$/, '') + 'M';
  if (count >= 1_000) return (count / 1_000).toFixed(1).replace(/\.0$/, '') + 'K';
  return count.toString();
}

function parseViewCount(viewCountStr: string): number {
  if (viewCountStr === "N/A") return 0;
  const lastChar = viewCountStr.slice(-1).toUpperCase();
  let numPart = viewCountStr;
  let multiplier = 1;

  if (lastChar === 'K') {
    multiplier = 1_000;
    numPart = viewCountStr.slice(0, -1);
  } else if (lastChar === 'M') {
    multiplier = 1_000_000;
    numPart = viewCountStr.slice(0, -1);
  } else if (lastChar === 'B') {
    multiplier = 1_000_000_000;
    numPart = viewCountStr.slice(0, -1);
  }
  
  const num = parseFloat(numPart);
  if (isNaN(num)) return parseInt(viewCountStr, 10) || 0; 
  
  return num * multiplier;
}

export async function getMockYouTubeVideos(): Promise<{ videos: YouTubeVideo[]; nextPageToken?: string }> { 
    const titles = [
        "Ultimate Travel Guide to Japan (Mock Data)",
        "Learn Coding in 10 Hours (Mock Data)",
        "Delicious Vegan Recipes (Mock Data)",
        "Top 10 Video Games of the Year (Mock Data)",
        "Space Exploration Documentary (Mock Data)",
        "Beginner's Guide to Stock Market (Mock Data)"
    ];
    const channels = ["Travel Guru", "Code Master", "Vegan Chef", "Game Reviewer", "Science Hub", "Finance Bro"];
    
    const mockVids = Array.from({ length: 6 }, (_, i) => ({
        id: `mock${i + 1}`,
        title: titles[i % titles.length],
        thumbnailUrl: `https://picsum.photos/480/270?random=${i + 1}&grayscale&blur=1`, 
        viewCount: formatViewCount(String(Math.floor(Math.random() * 5000000) + 100000)), 
        channelTitle: channels[i % channels.length]
    })).sort((a, b) => parseViewCount(b.viewCount) - parseViewCount(a.viewCount));
    return { videos: mockVids, nextPageToken: 'mockNextPageToken123' }; // Provide a mock token for testing UI
}

// Fetch videos from a specific channel using channelId
export async function fetchChannelVideos(channelId: string, maxResults: number = 8): Promise<YouTubeVideo[]> {
  return fetchWithYouTubeKeys(async (apiKey) => {
    const apiUrl = `https://www.googleapis.com/youtube/v3/search?key=${apiKey}&channelId=${channelId}&part=snippet,id&order=date&maxResults=${maxResults}&type=video`;
    const res = await fetch(apiUrl);
    const data = await res.json();
    if (!data.items) throw new Error("No videos found");
    return data.items.map((item: any) => ({
      id: item.id.videoId,
      title: item.snippet.title,
      thumbnailUrl: item.snippet.thumbnails.high?.url || item.snippet.thumbnails.medium.url,
      viewCount: "-",
      channelTitle: item.snippet.channelTitle,
    }));
  });
}

// Get the uploads playlist ID for a channel
export async function getUploadsPlaylistId(channelId: string): Promise<string> {
  return fetchWithYouTubeKeys(async (apiKey) => {
    const url = `https://www.googleapis.com/youtube/v3/channels?part=contentDetails&id=${channelId}&key=${apiKey}`;
    const res = await fetch(url);
    const data = await res.json();
    if (!data.items || !data.items[0]?.contentDetails?.relatedPlaylists?.uploads) {
      throw new Error("Could not get uploads playlist ID");
    }
    return data.items[0].contentDetails.relatedPlaylists.uploads;
  });
}

// Fetch videos from the uploads playlist of a channel
export async function fetchUploadsPlaylistVideos(channelId: string, maxResults: number = 8): Promise<YouTubeVideo[]> {
  const uploadsPlaylistId = await getUploadsPlaylistId(channelId);
  return fetchWithYouTubeKeys(async (apiKey) => {
    const url = `https://www.googleapis.com/youtube/v3/playlistItems?part=snippet&playlistId=${uploadsPlaylistId}&maxResults=${maxResults}&key=${apiKey}`;
    const res = await fetch(url);
    const data = await res.json();
    if (!data.items) throw new Error("No videos found in uploads playlist");
    const items = data.items.map((item: any) => ({
      id: item.snippet.resourceId.videoId,
      title: item.snippet.title,
      thumbnailUrl: item.snippet.thumbnails.high?.url || item.snippet.thumbnails.medium.url,
      viewCount: "-",
      channelTitle: item.snippet.channelTitle,
    }));
    // Fetch durations for all videos
    const videoIds = items.map((v: any) => v.id).join(",");
    if (!videoIds) return [];
    const detailsUrl = `https://www.googleapis.com/youtube/v3/videos?part=contentDetails&id=${videoIds}&key=${apiKey}`;
    const detailsRes = await fetch(detailsUrl);
    const detailsData = await detailsRes.json();
    const durationsMap = new Map(((detailsData.items || []) as any[]).map((v: any) => [v.id, v.contentDetails.duration]));
    // Filter out Shorts
    return items.filter((v: any) => {
      const duration = durationsMap.get(v.id);
      return duration && parseISO8601Duration(duration) >= 60;
    });
  });
}

// Fetch top thumbnails based on engagement metrics
export async function fetchTopThumbnails(maxResults: number = 8): Promise<YouTubeVideo[]> {
  return fetchWithYouTubeKeys(async (apiKey) => {
    // Search for popular videos with high engagement
    const searchUrl = `https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&order=viewCount&videoDefinition=high&maxResults=${maxResults}&key=${apiKey}`;
    const searchRes = await fetch(searchUrl);
    const searchData = await searchRes.json();
    
    if (!searchData.items) throw new Error("No videos found");
    
    // Get video IDs for detailed stats
    const videoIds = searchData.items.map((item: any) => item.id.videoId).join(',');
    if (!videoIds) return [];
    
    // Fetch detailed video stats including engagement metrics
    const videosUrl = `https://www.googleapis.com/youtube/v3/videos?part=snippet,statistics,contentDetails&id=${videoIds}&key=${apiKey}`;
    const videosRes = await fetch(videosUrl);
    const videosData = await videosRes.json();
    
    if (!videosData.items) return [];
    
    // Filter out Shorts and sort by engagement score
    const videos = videosData.items
      .filter((video: any) => {
        const duration = video.contentDetails?.duration;
        return duration && parseISO8601Duration(duration) >= 60;
      })
      .map((video: any) => {
        const stats = video.statistics;
        const viewCount = parseInt(stats.viewCount || '0', 10);
        const likeCount = parseInt(stats.likeCount || '0', 10);
        const commentCount = parseInt(stats.commentCount || '0', 10);
        
        // Calculate engagement score (weighted combination of views, likes, and comments)
        const engagementScore = (viewCount * 0.5) + (likeCount * 0.3) + (commentCount * 0.2);
        
        return {
          id: video.id,
          title: video.snippet.title,
          thumbnailUrl: video.snippet.thumbnails.high?.url || video.snippet.thumbnails.medium.url,
          viewCount: formatViewCount(stats.viewCount || '0'),
          channelTitle: video.snippet.channelTitle,
          engagementScore // Add this for sorting
        };
      })
      .sort((a: any, b: any) => b.engagementScore - a.engagementScore)
      .slice(0, maxResults)
      .map(({ engagementScore, ...video }: { engagementScore: number } & YouTubeVideo) => video); // Remove engagementScore from final output
    
    return videos;
  });
}
