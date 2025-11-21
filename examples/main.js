const NewspaperScraper = require('../lib/NewspaperScraper');
const fs = require('fs').promises;
const path = require('path');
const dotenv = require('dotenv');

// Load environment variables
dotenv.config();

const OUTPUT_DIR = 'output';

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

    await fs.mkdir(OUTPUT_DIR, { recursive: true });

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

    await fs.writeFile(filePath, rows.join('\n'), 'utf8');
    console.log(`Saved ${articles.length} records to ${filePath}`);
}

async function main() {
    try {
        const searchConfig = {
            keyword: "Cynthia Stone Creem",
            limit: 10000,
            dateRange: [2000, 2020],
            location: "us"
        };

        const scraper = new NewspaperScraper({
            concurrentPages: 1,
            resultsPerPage: 50,
            maxConcurrentRequests: 10,
            browser: {
                headless: false,
                userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
                executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
            },
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
    }
}

main();
