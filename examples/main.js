const NewspaperScraper = require('../lib/NewspaperScraper');
const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const dotenv = require('dotenv');

// Load environment variables
dotenv.config();

const OUTPUT_DIR = process.env.NEWSPAPER_OUTPUT_DIR || 'output';
const DEFAULT_USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

const DEFAULT_SEARCH_CONFIG = {
    keyword: 'Cynthia Stone Creem',
    limit: 10000,
    dateRange: [2000, 2020],
    location: 'us'
};

function fileExists(candidate) {
    if (!candidate) return false;
    try {
        return fs.existsSync(candidate);
    } catch {
        return false;
    }
}

function parsePositiveInt(value, fallback) {
    if (value === undefined || value === null || value === '') return fallback;
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function parseBoolean(value, fallback) {
    if (value === undefined || value === null || value === '') return fallback;
    const normalized = value.toString().trim().toLowerCase();
    if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
    if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
    return fallback;
}

function resolveChromeExecutable() {
    const envCandidates = [
        process.env.SCRAPER_CHROME_PATH,
        process.env.PUPPETEER_EXEC_PATH,
        process.env.CHROME_BIN
    ].filter(Boolean);

    for (const candidate of envCandidates) {
        if (fileExists(candidate)) {
            return candidate;
        }
    }

    try {
        const puppeteer = require('puppeteer');
        if (typeof puppeteer.executablePath === 'function') {
            const execPath = puppeteer.executablePath();
            if (fileExists(execPath)) {
                return execPath;
            }
        }
    } catch (error) {
        // puppeteer is optional for this resolution - ignore failures
    }

    const platform = process.platform;
    const fallbackCandidates = [];

    if (platform === 'darwin') {
        fallbackCandidates.push(
            '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
            '/Applications/Chromium.app/Contents/MacOS/Chromium'
        );
    } else if (platform === 'win32') {
        fallbackCandidates.push(
            'C:\\\\Program Files\\\\Google\\\\Chrome\\\\Application\\\\chrome.exe',
            'C:\\\\Program Files (x86)\\\\Google\\\\Chrome\\\\Application\\\\chrome.exe'
        );
    } else {
        fallbackCandidates.push(
            '/usr/bin/google-chrome',
            '/usr/bin/chromium-browser',
            '/usr/bin/chromium'
        );
    }

    return fallbackCandidates.find((candidate) => fileExists(candidate));
}

function buildSearchConfig() {
    const config = { ...DEFAULT_SEARCH_CONFIG };

    if (process.env.SEARCH_KEYWORD) {
        config.keyword = process.env.SEARCH_KEYWORD;
    }

    config.limit = parsePositiveInt(process.env.SEARCH_LIMIT, config.limit);

    if (process.env.SEARCH_LOCATION) {
        config.location = process.env.SEARCH_LOCATION;
    }

    const startYear = parsePositiveInt(process.env.SEARCH_DATE_START, null);
    const endYear = parsePositiveInt(process.env.SEARCH_DATE_END, null);

    if (startYear && endYear && startYear <= endYear) {
        config.dateRange = [startYear, endYear];
    }

    return config;
}

function buildBrowserConfig() {
    const browserConfig = {
        headless: parseBoolean(process.env.SCRAPER_HEADLESS, false),
        userAgent: process.env.SCRAPER_USER_AGENT || DEFAULT_USER_AGENT
    };

    const executablePath = resolveChromeExecutable();
    if (executablePath) {
        browserConfig.executablePath = executablePath;
    }

    return browserConfig;
}

function toSafeFragment(value) {
    return (value || 'all')
        .toString()
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/(^-|-$)/g, '') || 'all';
}

function csvEscape(value) {
    const stringValue = value === undefined || value === null ? '' : String(value);
    if (/[",\n]/.test(stringValue)) {
        return `"${stringValue.replace(/"/g, '""')}"`;
    }
    return stringValue;
}

function extractState(location = '') {
    if (!location) return '';
    const parts = location.split(',').map((part) => part.trim()).filter(Boolean);
    return parts.length ? parts[parts.length - 1] : '';
}

async function writeCsv(articles, searchConfig) {
    if (!articles.length) {
        console.warn('No articles found. CSV export skipped.');
        return;
    }

    await fsp.mkdir(OUTPUT_DIR, { recursive: true });

    const keywordPart = toSafeFragment(searchConfig.keyword);
    const datePart = searchConfig.dateRange ? searchConfig.dateRange.join('-') : 'all-years';
    const locationPart = searchConfig.location ? toSafeFragment(searchConfig.location) : 'all-locations';
    const filename = `articles_${keywordPart}_${datePart}_${locationPart}_${Date.now()}.csv`;
    const filePath = path.join(OUTPUT_DIR, filename);

    const rows = [
        'date,title,state,keywordMatches'
    ];

    for (const article of articles) {
        rows.push([
            csvEscape(article.date),
            csvEscape(article.title),
            csvEscape(extractState(article.location)),
            csvEscape(article.keywordMatches)
        ].join(','));
    }

    await fsp.writeFile(filePath, rows.join('\n'), 'utf8');
    console.log(`Saved ${articles.length} records to ${filePath}`);
}

async function main() {
    try {
        const searchConfig = buildSearchConfig();

        const scraper = new NewspaperScraper({
            concurrentPages: 1,
            resultsPerPage: 50,
            maxConcurrentRequests: 10,
            browser: buildBrowserConfig(),
            proxy: {
                enabled: false,
                host: process.env.PROXY_HOST,
                port: process.env.PROXY_PORT || 9008,
                username: process.env.PROXY_USER,
                password: process.env.PROXY_PASS
            },
            logger: {
                level: 'info'
            }
        });

        const articles = [];

        scraper.on('article', (article) => {
            articles.push(article);
            console.log(`Found article: ${article.title} (${article.date})`);
        });

        scraper.on('progress', ({current, total, percentage, stats}) => {
            console.log(`Progress: ${percentage.toFixed(2)}% (${current}/${total} pages)`);
            console.log(`Time elapsed: ${stats.timeElapsed.toFixed(2)}s`);
            console.log(`Average time per page: ${stats.avgPageTime.toFixed(2)}s`);
        });

        scraper.on('complete', (stats) => {
            console.log('Scraping complete!');
            console.log(`Total time: ${(stats.timeElapsed / 1000).toFixed(2)} seconds`);
        });

        await scraper.retrieve(searchConfig);
        await writeCsv(articles, searchConfig);

    } catch (error) {
        console.error('Scraping failed:', error);
        process.exitCode = 1;
    }
}

main();
