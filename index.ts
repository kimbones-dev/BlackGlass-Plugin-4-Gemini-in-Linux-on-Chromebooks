/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
import { marked } from 'marked';
import OpenAI from 'openai';

interface ChatMessage {
  id: string;
  role: 'system' | 'user' | 'assistant';
  content: string;
  timestamp: string;
}

const conversationHistory: ChatMessage[] = [];
let isGenerating = false;
let selectedModel = 'gemini-3.6-flash';

// Initialize OpenAI client pointing to the secure server-side proxy
const openai = new OpenAI({
  apiKey: 'server-proxy',
  baseURL: `${window.location.origin}/api/openai/`,
  dangerouslyAllowBrowser: true,
});

function getFormattedTime(): string {
  const now = new Date();
  return now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function updateStatus(status: 'ready' | 'generating' | 'error', text?: string) {
  const statusEl = document.getElementById('status-indicator');
  const statusDot = document.getElementById('status-dot');
  const statusText = document.getElementById('status-text');

  if (!statusEl || !statusDot || !statusText) return;

  if (status === 'ready') {
    statusDot.className = 'w-2 h-2 rounded-full bg-emerald-500';
    statusText.textContent = text || 'Server Ready';
  } else if (status === 'generating') {
    statusDot.className = 'w-2 h-2 rounded-full bg-amber-500 animate-ping';
    statusText.textContent = text || 'Generating...';
  } else if (status === 'error') {
    statusDot.className = 'w-2 h-2 rounded-full bg-rose-500';
    statusText.textContent = text || 'Error encountered';
  }
}

function showErrorBanner(message: string) {
  const banner = document.getElementById('error-banner');
  const text = document.getElementById('error-message');
  if (banner && text) {
    text.textContent = message;
    banner.classList.remove('hidden');
  }
}

function hideErrorBanner() {
  const banner = document.getElementById('error-banner');
  if (banner) {
    banner.classList.add('hidden');
  }
}

async function renderMarkdown(content: string): Promise<string> {
  try {
    return await marked.parse(content || '');
  } catch {
    return `<p class="whitespace-pre-wrap">${content}</p>`;
  }
}

async function appendMessageUI(msg: ChatMessage) {
  const list = document.getElementById('messages-list');
  if (!list) return;

  const msgCard = document.createElement('article');
  msgCard.id = `message-card-${msg.id}`;
  msgCard.className = `p-5 rounded-xl border transition-all duration-200 ${
    msg.role === 'user'
      ? 'bg-white border-slate-200 shadow-xs'
      : 'bg-slate-50/80 border-slate-200/80 shadow-xs'
  }`;

  const renderedHtml = await renderMarkdown(msg.content);
  const isUser = msg.role === 'user';

  msgCard.innerHTML = `
    <div class="flex items-center justify-between pb-3 mb-3 border-b border-slate-100">
      <div class="flex items-center gap-2">
        <span class="inline-flex items-center justify-center px-2.5 py-0.5 text-xs font-semibold rounded-md ${
          isUser
            ? 'bg-indigo-50 text-indigo-700 border border-indigo-200/50'
            : 'bg-emerald-50 text-emerald-700 border border-emerald-200/50'
        }">
          ${isUser ? 'You' : 'Gemini Assistant'}
        </span>
        <span class="text-xs text-slate-400 font-mono">${msg.timestamp}</span>
      </div>
      <button
        id="btn-copy-${msg.id}"
        type="button"
        class="text-xs font-medium text-slate-500 hover:text-slate-800 px-2 py-1 rounded hover:bg-slate-100 transition-colors"
        title="Copy message content"
      >
        Copy
      </button>
    </div>
    <div class="prose prose-slate prose-sm max-w-none text-slate-700 leading-relaxed overflow-x-auto">
      ${renderedHtml}
    </div>
  `;

  list.appendChild(msgCard);

  // Bind copy button
  const copyBtn = document.getElementById(`btn-copy-${msg.id}`);
  if (copyBtn) {
    copyBtn.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(msg.content);
        copyBtn.textContent = 'Copied!';
        setTimeout(() => {
          copyBtn.textContent = 'Copy';
        }, 1800);
      } catch {
        copyBtn.textContent = 'Failed';
      }
    });
  }

  msgCard.scrollIntoView({ behavior: 'smooth', block: 'end' });
}

async function sendPrompt(userPrompt: string) {
  if (!userPrompt.trim() || isGenerating) return;

  hideErrorBanner();
  isGenerating = true;
  updateStatus('generating', 'Contacting Gemini...');

  const sendBtn = document.getElementById('btn-send') as HTMLButtonElement | null;
  const promptInput = document.getElementById('prompt-input') as HTMLTextAreaElement | null;
  if (sendBtn) sendBtn.disabled = true;
  if (promptInput) promptInput.disabled = true;

  const userMsg: ChatMessage = {
    id: `user-${Date.now()}`,
    role: 'user',
    content: userPrompt,
    timestamp: getFormattedTime(),
  };

  conversationHistory.push(userMsg);
  await appendMessageUI(userMsg);

  if (promptInput) {
    promptInput.value = '';
    promptInput.style.height = 'auto';
  }

  // Create typing skeleton indicator
  const list = document.getElementById('messages-list');
  const skeleton = document.createElement('div');
  skeleton.id = 'typing-skeleton';
  skeleton.className = 'p-5 rounded-xl border border-slate-200 bg-white/60 animate-pulse';
  skeleton.innerHTML = `
    <div class="flex items-center gap-2 mb-3">
      <div class="h-4 w-20 bg-slate-200 rounded"></div>
      <div class="h-3 w-12 bg-slate-100 rounded"></div>
    </div>
    <div class="space-y-2">
      <div class="h-3.5 bg-slate-200 rounded w-5/6"></div>
      <div class="h-3.5 bg-slate-200 rounded w-4/6"></div>
      <div class="h-3.5 bg-slate-100 rounded w-3/6"></div>
    </div>
  `;
  list?.appendChild(skeleton);
  skeleton.scrollIntoView({ behavior: 'smooth', block: 'end' });

  try {
    const apiMessages = conversationHistory.map((m) => ({
      role: m.role,
      content: m.content,
    }));

    const completion = await openai.chat.completions.create({
      model: selectedModel,
      messages: [
        {
          role: 'system',
          content:
            'You are an Obsidian Canvas Co-Creator assistant. Provide thoughtful, well-structured answers using clean markdown formatting, lists, tables, or concept maps whenever appropriate.',
        },
        ...apiMessages,
      ],
    });

    skeleton.remove();

    const replyContent =
      completion.choices?.[0]?.message?.content ||
      'No response text returned by the model.';

    const assistantMsg: ChatMessage = {
      id: `ai-${Date.now()}`,
      role: 'assistant',
      content: replyContent,
      timestamp: getFormattedTime(),
    };

    conversationHistory.push(assistantMsg);
    await appendMessageUI(assistantMsg);
    updateStatus('ready', 'Connected to Gemini');
  } catch (err: any) {
    skeleton.remove();
    console.error('API call failed:', err);
    updateStatus('error', 'Request failed');
    showErrorBanner(
      err?.message || 'Failed to communicate with the Gemini API server proxy.'
    );
  } finally {
    isGenerating = false;
    if (sendBtn) sendBtn.disabled = false;
    if (promptInput) {
      promptInput.disabled = false;
      promptInput.focus();
    }
  }
}

function initDOM() {
  const app = document.getElementById('app');
  if (!app) return;

  app.innerHTML = `
    <!-- Top Header -->
    <header id="app-header" class="border-b border-slate-200 bg-white sticky top-0 z-10 shadow-2xs">
      <div class="max-w-4xl mx-auto px-4 sm:px-6 py-4 flex flex-wrap items-center justify-between gap-4">
        <div>
          <div class="flex items-center gap-3">
            <h1 id="app-title" class="text-lg font-bold tracking-tight text-slate-900">
              Obsidian Canvas Co-Creator
            </h1>
            <span class="text-xs px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 font-medium border border-slate-200">
              OpenAI SDK Compatibility
            </span>
          </div>
          <p id="app-subtitle" class="text-xs text-slate-500 mt-0.5">
            Server-proxied Gemini models for Obsidian and Chromebook environments
          </p>
        </div>

        <div class="flex items-center gap-3">
          <!-- Model Select -->
          <div class="flex items-center gap-1.5 text-xs text-slate-600">
            <label for="model-selector" class="font-medium text-slate-500">Model:</label>
            <select
              id="model-selector"
              class="border border-slate-200 rounded-lg px-2.5 py-1.5 bg-white text-xs font-medium text-slate-700 shadow-2xs focus:outline-none focus:ring-2 focus:ring-slate-300"
            >
              <option value="gemini-3.6-flash" selected>gemini-3.6-flash (Fast & Recommended)</option>
              <option value="gemini-3.8-flash">gemini-3.8-flash</option>
              <option value="gemini-3.1-flash-lite">gemini-3.1-flash-lite</option>
            </select>
          </div>

          <!-- Status Indicator -->
          <div id="status-indicator" class="flex items-center gap-2 px-3 py-1.5 rounded-full bg-slate-50 border border-slate-200 text-xs font-medium text-slate-600">
            <span id="status-dot" class="w-2 h-2 rounded-full bg-emerald-500"></span>
            <span id="status-text">Server Ready</span>
          </div>
        </div>
      </div>
    </header>

    <!-- Error Banner -->
    <div id="error-banner" class="hidden bg-rose-50 border-b border-rose-200 px-4 py-3">
      <div class="max-w-4xl mx-auto flex items-start justify-between gap-3 text-sm text-rose-800">
        <div class="flex items-center gap-2">
          <svg class="w-4 h-4 shrink-0 text-rose-500" fill="currentColor" viewBox="0 0 20 20">
            <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clip-rule="evenodd" />
          </svg>
          <span id="error-message">An error occurred while connecting.</span>
        </div>
        <button
          id="btn-dismiss-error"
          type="button"
          class="text-xs font-medium text-rose-700 hover:text-rose-900 underline cursor-pointer"
        >
          Dismiss
        </button>
      </div>
    </div>

    <!-- Main Content Container -->
    <main class="flex-1 max-w-4xl w-full mx-auto p-4 sm:p-6 flex flex-col gap-6">
      <!-- Conversation Stream -->
      <section id="messages-container" class="flex-1 flex flex-col gap-4">
        <div id="messages-list" class="flex flex-col gap-4"></div>
      </section>

      <!-- Suggested Obsidian Canvas Prompts -->
      <section id="suggestions-container" class="pt-2">
        <div class="flex items-center justify-between mb-2">
          <span class="text-xs font-semibold uppercase tracking-wider text-slate-400">
            Suggested Prompts
          </span>
          <button
            id="btn-clear-chat"
            type="button"
            class="text-xs text-slate-400 hover:text-slate-600 transition-colors"
          >
            Clear conversation
          </button>
        </div>
        <div class="grid grid-cols-1 sm:grid-cols-3 gap-2">
          <button
            id="btn-chip-1"
            type="button"
            class="prompt-chip text-left text-xs text-slate-600 bg-white hover:bg-slate-50 border border-slate-200 rounded-lg p-2.5 transition-colors shadow-2xs"
            data-prompt="Create an Obsidian Canvas node hierarchy for a Machine Learning study plan"
          >
            📊 Canvas node hierarchy for ML study plan
          </button>
          <button
            id="btn-chip-2"
            type="button"
            class="prompt-chip text-left text-xs text-slate-600 bg-white hover:bg-slate-50 border border-slate-200 rounded-lg p-2.5 transition-colors shadow-2xs"
            data-prompt="Format a Markdown note with YAML frontmatter, backlinks, and callouts"
          >
            📝 Markdown note with YAML and callouts
          </button>
          <button
            id="btn-chip-3"
            type="button"
            class="prompt-chip text-left text-xs text-slate-600 bg-white hover:bg-slate-50 border border-slate-200 rounded-lg p-2.5 transition-colors shadow-2xs"
            data-prompt="Brainstorm 5 connected concepts for a personal knowledge management graph"
          >
            🧠 5 connected concepts for PKM graph
          </button>
        </div>
      </section>

      <!-- Prompt Input Form -->
      <form id="prompt-form" class="bg-white border border-slate-200 rounded-xl p-3 shadow-xs flex flex-col gap-2">
        <label for="prompt-input" class="sr-only">Ask a question or enter prompt</label>
        <textarea
          id="prompt-input"
          rows="2"
          placeholder="Ask Gemini anything or generate Obsidian notes..."
          class="w-full resize-none text-sm text-slate-800 placeholder-slate-400 focus:outline-none leading-relaxed p-1"
        ></textarea>
        <div class="flex items-center justify-between pt-2 border-t border-slate-100 text-xs">
          <span class="text-slate-400">Press <kbd class="px-1.5 py-0.5 rounded bg-slate-100 border border-slate-200 text-slate-600 font-mono text-2xs">Enter</kbd> to send, <kbd class="px-1.5 py-0.5 rounded bg-slate-100 border border-slate-200 text-slate-600 font-mono text-2xs">Shift+Enter</kbd> for newline</span>
          <button
            id="btn-send"
            type="submit"
            class="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white font-medium rounded-lg text-xs transition-colors shadow-xs flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <span>Send</span>
            <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M14 5l7 7m0 0l-7 7m7-7H3"/>
            </svg>
          </button>
        </div>
      </form>
    </main>
  `;

  // Model selection listener
  const modelSelect = document.getElementById('model-selector') as HTMLSelectElement | null;
  if (modelSelect) {
    modelSelect.addEventListener('change', (e) => {
      selectedModel = (e.target as HTMLSelectElement).value;
    });
  }

  // Dismiss error listener
  const dismissBtn = document.getElementById('btn-dismiss-error');
  if (dismissBtn) {
    dismissBtn.addEventListener('click', hideErrorBanner);
  }

  // Clear chat listener
  const clearBtn = document.getElementById('btn-clear-chat');
  if (clearBtn) {
    clearBtn.addEventListener('click', () => {
      conversationHistory.length = 0;
      const list = document.getElementById('messages-list');
      if (list) list.innerHTML = '';
      hideErrorBanner();
    });
  }

  // Prompt chips
  const chips = document.querySelectorAll('.prompt-chip');
  chips.forEach((chip) => {
    chip.addEventListener('click', () => {
      const prompt = chip.getAttribute('data-prompt');
      if (prompt) {
        sendPrompt(prompt);
      }
    });
  });

  // Form submission
  const form = document.getElementById('prompt-form');
  const input = document.getElementById('prompt-input') as HTMLTextAreaElement | null;

  if (form && input) {
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const val = input.value.trim();
      if (val) {
        sendPrompt(val);
      }
    });

    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        const val = input.value.trim();
        if (val) {
          sendPrompt(val);
        }
      }
    });
  }
}

async function init() {
  initDOM();
  // Automatically run the initial user query as designed in the original script
  await sendPrompt('Explain to me how AI works');
}

// Safely boot without top-level await
init().catch((err) => {
  console.error('Initialization error:', err);
  showErrorBanner(err?.message || 'Failed to initialize applet.');
});
