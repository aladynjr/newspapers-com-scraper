# Newspaper.com Scraper

This project is a Python-based web scraper designed to extract data from Newspapers.com. It uses asynchronous programming to efficiently scrape search results and keyword matches from the website, based on specific keywords, dates, and locations.

## Sample Data

To see an example of the kind of data this scraper can collect, check out this [sample spreadsheet](https://docs.google.com/spreadsheets/d/1uq366pyEfolITFZ9X507ogsQjssx_pL1bp1pGPIPtt4/edit?gid=0#gid=0).

## Features

- Asynchronous scraping using `asyncio` and `aiohttp`
- Headless browser automation with Playwright
- Proxy support using GEONODE.com proxies
- Customizable search parameters (keyword, date range, location)
- Extraction of key details:
  1. Newspaper title
  2. Page number
  3. Date
  4. Location
  5. Number of keyword matches on the page
- Output in both JSON and CSV formats
- Anti-scraping measures to handle CAPTCHA and rate-limiting
- Optimized for large datasets with parallel scraping

## Prerequisites

- Python 3.7+
- A GEONODE.com account for proxy access

## Installation

1. Clone this repository:
   ```
   git clone https://github.com/yourusername/newspaper-scraper.git
   cd newspaper-scraper
   ```

2. Set up a virtual environment:
   ```
   python -m venv venv
   source venv/bin/activate  # On Windows, use `venv\Scripts\activate`
   ```

3. Install the required packages:
   ```
   pip install -r requirements.txt
   ```

4. Install Playwright browsers:
   ```
   playwright install
   ```

## Configuration

1. Create a `.env` file in the project root directory with your GEONODE.com proxy credentials:
   ```
   PROXY_HOST=your_geonode_proxy_host
   PROXY_USER=your_geonode_username
   PROXY_PASS=your_geonode_password
   ```

2. Set up your GEONODE proxy:
   - Go to the GEONODE.com website and log into your account.
   - Navigate to the "Shared Datacenter Proxies" page.
   - Find the settings for port 9008.
   - Set the country for this port to USA.

   This configuration ensures that the scraper uses a USA-based proxy, which is optimal for accessing Newspapers.com.

## Usage

Modify the `main()` function in the script to set your desired search parameters:

```python
result = await scrape_newspapers(
    keyword="your search term",
    output_file="your_output_filename",
    max_pages=10,
    date=[2023],  # Or [start_year, end_year] for a range
    location="us"  # Or a specific US state code like "us-ny"
)
```

Then run the script:

```
python scraper.py
```

The results will be saved in the `output` directory in both JSON and CSV formats.

## Key Features and Optimizations

- **Parallel Scraping**: The script uses asyncio to perform parallel requests, optimizing the scraping process for large datasets.
- **Anti-Scraping Measures**: Implements retry mechanisms and Cloudflare challenge handling to mitigate anti-scraping protections.
- **Proxy Rotation**: Uses GEONODE.com proxies to distribute requests and avoid IP-based rate limiting.
- **Efficient Data Extraction**: Extracts all required fields (newspaper title, page number, date, location, keyword match count) for each result.
- **Scalability**: Designed to handle large datasets efficiently, with the ability to process multiple pages concurrently.

## Limitations

- The scraper is subject to Newspapers.com's terms of service and rate limiting.
- Performance may vary based on network conditions and GEONODE proxy availability.
- The script may encounter Cloudflare challenges, which it attempts to handle automatically.
