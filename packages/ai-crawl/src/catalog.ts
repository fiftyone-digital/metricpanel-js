export const AI_CRAWLER_CATEGORY = {
  ANSWER: 'answer',
  INDEXING: 'indexing',
  TRAINING: 'training',
  OTHER: 'other',
} as const

export type AICrawlerCategory = (typeof AI_CRAWLER_CATEGORY)[keyof typeof AI_CRAWLER_CATEGORY]

export type AICrawlerDefinition = {
  id: string
  name: string
  provider: string
  category: AICrawlerCategory
  userAgentTokens: readonly string[]
  documentationUrls?: readonly string[]
  ipRangeUrls?: readonly string[]
}

type CrawlerOptions = {
  tokens?: readonly string[]
  documentationUrls?: readonly string[]
  ipRangeUrls?: readonly string[]
}

function crawler(
  id: string,
  name: string,
  provider: string,
  category: AICrawlerCategory,
  options: CrawlerOptions = {}
): AICrawlerDefinition {
  return {
    id,
    name,
    provider,
    category,
    userAgentTokens: options.tokens ?? [name],
    ...(options.documentationUrls ? { documentationUrls: options.documentationUrls } : {}),
    ...(options.ipRangeUrls ? { ipRangeUrls: options.ipRangeUrls } : {}),
  }
}

const DOCUMENTATION = {
  openai: ['https://developers.openai.com/bots/'],
  anthropic: [
    'https://support.claude.com/en/articles/8896518-does-anthropic-crawl-data-from-the-web-and-how-can-site-owners-block-the-crawler',
  ],
  perplexity: ['https://docs.perplexity.ai/docs/resources/perplexity-crawlers'],
  google: ['https://developers.google.com/search/docs/crawling-indexing/overview-google-crawlers'],
  microsoft: ['https://www.bing.com/webmasters/help/which-crawlers-does-bing-use-8c184ec0'],
  apple: ['https://support.apple.com/en-us/119829'],
  amazon: ['https://developer.amazon.com/amazonbot'],
  meta: ['https://developers.facebook.com/docs/sharing/webmasters/crawler/'],
  commonCrawl: ['https://commoncrawl.org/ccbot'],
} as const

const IP_RANGES = {
  chatgptUser: ['https://openai.com/chatgpt-user.json'],
  openaiSearch: ['https://openai.com/searchbot.json'],
  gptbot: ['https://openai.com/gptbot.json'],
  anthropic: ['https://claude.com/crawling/bots.json'],
  perplexityUser: ['https://www.perplexity.com/perplexity-user.json'],
  perplexityBot: ['https://www.perplexity.com/perplexitybot.json'],
  google: [
    'https://developers.google.com/static/crawling/ipranges/common-crawlers.json',
    'https://developers.google.com/static/crawling/ipranges/special-crawlers.json',
    'https://developers.google.com/static/crawling/ipranges/user-triggered-fetchers.json',
    'https://developers.google.com/static/crawling/ipranges/user-triggered-fetchers-google.json',
    'https://developers.google.com/static/crawling/ipranges/user-triggered-agents.json',
  ],
  bing: ['https://www.bing.com/toolbox/bingbot.json'],
  apple: ['https://search.developer.apple.com/applebot.json'],
  amazon: ['https://developer.amazon.com/amazonbot/ip-addresses/'],
} as const

const openai = { documentationUrls: DOCUMENTATION.openai }
const anthropic = {
  documentationUrls: DOCUMENTATION.anthropic,
  ipRangeUrls: IP_RANGES.anthropic,
}
const google = { documentationUrls: DOCUMENTATION.google, ipRangeUrls: IP_RANGES.google }
const microsoft = { documentationUrls: DOCUMENTATION.microsoft }
const apple = { documentationUrls: DOCUMENTATION.apple, ipRangeUrls: IP_RANGES.apple }
const amazon = { documentationUrls: DOCUMENTATION.amazon, ipRangeUrls: IP_RANGES.amazon }
const meta = { documentationUrls: DOCUMENTATION.meta }

export const AI_CRAWLERS = [
  crawler('chatgpt-user', 'ChatGPT-User', 'OpenAI', 'answer', {
    ...openai,
    ipRangeUrls: IP_RANGES.chatgptUser,
  }),
  crawler('oai-searchbot', 'OAI-SearchBot', 'OpenAI', 'indexing', {
    ...openai,
    ipRangeUrls: IP_RANGES.openaiSearch,
  }),
  crawler('oai-adsbot', 'OAI-AdsBot', 'OpenAI', 'other', openai),
  crawler('gptbot', 'GPTBot', 'OpenAI', 'training', {
    ...openai,
    ipRangeUrls: IP_RANGES.gptbot,
  }),

  crawler('claude-user', 'Claude-User', 'Anthropic', 'answer', anthropic),
  crawler('claude-searchbot', 'Claude-SearchBot', 'Anthropic', 'indexing', anthropic),
  crawler('claudebot', 'ClaudeBot', 'Anthropic', 'training', {
    ...anthropic,
    tokens: ['ClaudeBot', 'anthropic-ai'],
  }),

  crawler('perplexity-user', 'Perplexity-User', 'Perplexity', 'answer', {
    documentationUrls: DOCUMENTATION.perplexity,
    ipRangeUrls: IP_RANGES.perplexityUser,
  }),
  crawler('perplexitybot', 'PerplexityBot', 'Perplexity', 'indexing', {
    documentationUrls: DOCUMENTATION.perplexity,
    ipRangeUrls: IP_RANGES.perplexityBot,
  }),

  crawler('google-inspection-tool', 'Google-InspectionTool', 'Google', 'indexing', google),
  crawler('googleother', 'GoogleOther', 'Google', 'training', google),
  crawler('google-extended', 'Google-Extended', 'Google', 'training', google),
  crawler('google-cloudvertexbot', 'Google-CloudVertexBot', 'Google', 'training', google),
  crawler('google-agent', 'Google-Agent', 'Google', 'answer', google),
  crawler('google-notebooklm', 'Google-NotebookLM', 'Google', 'answer', google),
  crawler('google-read-aloud', 'Google-Read-Aloud', 'Google', 'answer', google),
  crawler('googlebot', 'Googlebot', 'Google', 'indexing', google),
  crawler('googleagent', 'GoogleAgent', 'Google', 'answer', google),

  crawler('mistralai-user', 'MistralAI-User', 'Mistral', 'answer'),
  crawler('mistralai-index', 'MistralAI-Index', 'Mistral', 'indexing'),

  crawler('bingbot', 'Bingbot', 'Microsoft', 'indexing', {
    ...microsoft,
    tokens: ['bingbot'],
    ipRangeUrls: IP_RANGES.bing,
  }),
  crawler('msnbot', 'msnbot', 'Microsoft', 'indexing', {
    ...microsoft,
    ipRangeUrls: IP_RANGES.bing,
  }),
  crawler('copilot', 'Copilot', 'Microsoft', 'answer', {
    ...microsoft,
    tokens: ['Copilot', 'MicrosoftPreview', 'CopilotBot'],
  }),

  crawler('applebot-extended', 'Applebot-Extended', 'Apple', 'training', apple),
  crawler('applebot', 'Applebot', 'Apple', 'training', apple),

  crawler('amazonbot', 'Amazonbot', 'Amazon', 'training', amazon),
  crawler('amzn-searchbot', 'Amzn-SearchBot', 'Amazon', 'indexing', amazon),
  crawler('amzn-user', 'Amzn-User', 'Amazon', 'answer', amazon),

  crawler('duckassistbot', 'DuckAssistBot', 'DuckDuckGo', 'answer'),

  crawler('xai-searchbot', 'xAI-SearchBot', 'SpaceXAI', 'answer'),
  crawler('grok-deepsearch', 'Grok-DeepSearch', 'SpaceXAI', 'answer'),
  crawler('grokbot', 'GrokBot', 'SpaceXAI', 'other'),
  crawler('xai-bot', 'xAI-Bot', 'SpaceXAI', 'other'),
  crawler('xai-grok', 'xAI-Grok', 'SpaceXAI', 'other'),
  crawler('xai-web-crawler', 'xAI-Web-Crawler', 'SpaceXAI', 'other'),
  crawler('grok', 'Grok', 'SpaceXAI', 'other'),

  crawler('meta-externalfetcher', 'meta-externalfetcher', 'Meta', 'answer', meta),
  crawler('meta-webindexer', 'meta-webindexer', 'Meta', 'indexing', meta),
  crawler('meta-externalagent', 'meta-externalagent', 'Meta', 'training', meta),
  crawler('meta-externalads', 'meta-externalads', 'Meta', 'other', meta),
  crawler('facebookexternalhit', 'facebookexternalhit', 'Meta', 'other', meta),
  crawler('facebookbot', 'FacebookBot', 'Meta', 'other', meta),

  crawler('kimi-user', 'Kimi-User', 'Moonshot AI', 'answer'),
  crawler('kimi-searchbot', 'Kimi-SearchBot', 'Moonshot AI', 'indexing'),
  crawler('kimibot', 'KimiBot', 'Moonshot AI', 'training'),

  crawler('doubaobot', 'Doubaobot', 'ByteDance', 'other'),
  crawler('bytespider', 'Bytespider', 'ByteDance', 'training'),
  crawler('tiktokspider', 'TikTokSpider', 'ByteDance', 'indexing'),

  crawler('erniebot', 'ERNIEBot', 'Baidu', 'training'),
  crawler('yiyanbot', 'YiyanBot', 'Baidu', 'other'),
  crawler('baiduspider', 'Baiduspider', 'Baidu', 'indexing'),

  crawler('qwen-user', 'Qwen-User', 'Alibaba', 'answer'),
  crawler('qwenbot', 'QwenBot', 'Alibaba', 'training'),
  crawler('tongyibot', 'TongyiBot', 'Alibaba', 'other'),
  crawler('aliyunbot', 'AliyunBot', 'Alibaba', 'other'),

  crawler('chatglm-spider', 'ChatGLM-Spider', 'Zhipu AI', 'training'),
  crawler('deepseekbot', 'DeepSeekBot', 'DeepSeek', 'training'),
  crawler('cohere-ai', 'cohere-ai', 'Cohere', 'training'),
  crawler('cohere-training-data-crawler', 'cohere-training-data-crawler', 'Cohere', 'training'),
  crawler('ai2bot', 'AI2Bot', 'Allen AI', 'training'),
  crawler('youbot', 'YouBot', 'You.com', 'indexing'),
  crawler('ccbot', 'CCBot', 'Common Crawl', 'training', {
    documentationUrls: DOCUMENTATION.commonCrawl,
  }),

  // Additional established crawlers tracked by MetricPanel beyond the comparison baseline.
  crawler('diffbot', 'Diffbot', 'Diffbot', 'training'),
  crawler('timpibot', 'Timpibot', 'Timpi', 'indexing'),
  crawler('imagesiftbot', 'ImageSiftBot', 'ImageSift', 'training'),
  crawler('omgilibot', 'Omgilibot', 'Webz.io', 'training', {
    tokens: ['omgilibot', 'omgili'],
  }),
  crawler('semrushbot-ocob', 'SemrushBot-OCOB', 'Semrush', 'training'),
  crawler('petalbot', 'PetalBot', 'Huawei', 'indexing'),
  crawler('yandexbot', 'YandexBot', 'Yandex', 'indexing'),
] as const satisfies readonly AICrawlerDefinition[]

const NORMALIZED_TOKENS = AI_CRAWLERS.flatMap((definition) =>
  definition.userAgentTokens.map((token) => ({
    crawler: definition as AICrawlerDefinition,
    token: token.toLowerCase(),
  }))
).sort((left, right) => right.token.length - left.token.length)

const SPACEXAI_FALLBACK: AICrawlerDefinition = {
  id: 'spacexai-unknown',
  name: 'SpaceXAI crawler',
  provider: 'SpaceXAI',
  category: 'other',
  userAgentTokens: ['SpaceXAI-'],
}
const SPACEXAI_USER_AGENT_PREFIX = 'spacexai-'

export function detectAICrawler(userAgent: string | null | undefined): AICrawlerDefinition | null {
  const normalized = userAgent?.trim().toLowerCase()
  if (!normalized) return null

  const knownCrawler = NORMALIZED_TOKENS.find(({ token }) => normalized.includes(token))?.crawler
  if (knownCrawler) return knownCrawler

  // Keep tracking if SpaceXAI prefixes an unannounced crawler before the catalog catches up.
  return normalized.includes(SPACEXAI_USER_AGENT_PREFIX) ? SPACEXAI_FALLBACK : null
}

export function getAICrawlerById(id: string): AICrawlerDefinition | null {
  if (id === SPACEXAI_FALLBACK.id) return SPACEXAI_FALLBACK
  return AI_CRAWLERS.find((definition) => definition.id === id) ?? null
}
