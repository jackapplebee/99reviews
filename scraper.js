// Import fetch for Node.js compatibility
const fetch = require('node-fetch');

// Google Reviews Scraper - Outscraper to Bubble Integration
// For GitHub Actions deployment with 30-minute scheduling

const OUTSCRAPER_API_KEY = process.env.OUTSCRAPER_API_KEY || 'ZDEwYTgxZTIxYzI2NGE1MTk4OWE2YzIxNmJmMjgzODd8N2Y3MDYzZTMxMQ';
const BUBBLE_API_URL = 'https://feedback2-15788.bubbleapps.io/api/1.1/obj/Google_Review';
const BUBBLE_API_TOKEN = process.env.BUBBLE_API_TOKEN || '0dfd48c46d7248ed9e3fdbf50b10a4a1';

// Replace this with your actual Google Business Profile URL
const GOOGLE_BUSINESS_URL = 'https://www.google.com/maps/place/APPLEBEE\'s+-+Fish+%26+Seafood/@51.5051023,-0.0935601,17z/data=!4m6!3m5!1s0x487603579d38108f:0x33a6f91073961d23!8m2!3d51.505099!4d-0.0909798!16s%2Fg%2F1vmr0vx1';

async function scrapeGoogleReviews() {
  try {
    console.log('Starting Google Reviews scrape...');
    
    // Step 1: Scrape reviews from Outscraper
    const outscraper_url = 'https://api.outscraper.com/maps/reviews-v3';
    const params = new URLSearchParams({
      query: GOOGLE_BUSINESS_URL,
      reviewsLimit: 50, // Adjust as needed
      language: 'en'
    });
    
    const scrapeResponse = await fetch(`${outscraper_url}?${params}`, {
      method: 'GET',
      headers: {
        'X-API-KEY': OUTSCRAPER_API_KEY
      }
    });
    
    if (!scrapeResponse.ok) {
      throw new Error(`Outscraper API error: ${scrapeResponse.status}`);
    }
    
    const scrapeData = await scrapeResponse.json();
    console.log('Scraped data:', scrapeData);
    
    // Step 2: Process and send reviews to Bubble
    const business = scrapeData.data[0]; // First business result
    const reviews = business.reviews_data || [];
    
    let newReviews = 0;
    
    for (const review of reviews) {
      // Format data for Bubble
      const bubbleReview = {
        rating: review.review_rating || 0,
        reviewer_name: review.review_author_name || 'Anonymous',
        review_text: review.review_text || '',
        review_date: review.review_datetime_utc ? new Date(review.review_datetime_utc).toISOString().split('T')[0] : new Date().toISOString().split('T')[0],
        google_review_id: review.review_id || `${review.review_author_name}_${review.review_datetime_utc}`
      };
      
      // Send to Bubble
      try {
        const bubbleResponse = await fetch(`${BUBBLE_API_URL}?api_token=${BUBBLE_API_TOKEN}`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(bubbleReview)
        });
        
        if (bubbleResponse.ok) {
          newReviews++;
          console.log(`Added review from ${bubbleReview.reviewer_name}`);
        } else {
          const errorText = await bubbleResponse.text();
          console.log(`Failed to add review: ${errorText}`);
        }
        
        // Add small delay to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 100));
        
      } catch (error) {
        console.error('Error sending review to Bubble:', error);
      }
    }
    
    console.log(`Scraping complete. Added ${newReviews} new reviews.`);
    return { success: true, newReviews, totalReviews: reviews.length };
    
  } catch (error) {
    console.error('Scraping failed:', error);
    return { success: false, error: error.message };
  }
}

// For automation (can be called by cron job, etc.)
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { scrapeGoogleReviews };
}

// Auto-run when executed directly
if (require.main === module) {
  console.log('Starting automated Google Reviews scraper...');
  scrapeGoogleReviews().then(result => {
    console.log('Final result:', result);
    process.exit(result.success ? 0 : 1);
  });
}
