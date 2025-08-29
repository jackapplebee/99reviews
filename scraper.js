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
    
    // Step 1: Set up 24-hour window from 4am yesterday to 4am today (London time)
    const now = new Date();
    
    // Calculate 4am today London time
    const today4am = new Date();
    today4am.setHours(4, 0, 0, 0);
    
    // Calculate 4am yesterday London time  
    const yesterday4am = new Date(today4am);
    yesterday4am.setDate(yesterday4am.getDate() - 1);
    
    console.log(`Looking for reviews between: ${yesterday4am.toISOString()} and ${today4am.toISOString()}`);
    
    // Step 2: Initiate scraping request to Outscraper
    
    // Step 1: Initiate scraping request to Outscraper
    const outscraper_url = 'https://api.outscraper.com/maps/reviews-v3';
    
    const params = new URLSearchParams({
      query: GOOGLE_BUSINESS_URL,
      reviewsLimit: 50,
      language: 'en',
      sort: 'newest' // Get newest reviews first
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
    console.log('Initial response:', scrapeData);
    
    // Step 2: Handle async response
    let finalData;
    if (scrapeData.status === 'Pending' && scrapeData.results_location) {
      console.log('Request is pending, waiting for results...');
      
      // Wait and poll for results
      let attempts = 0;
      const maxAttempts = 12; // 2 minutes max wait
      
      while (attempts < maxAttempts) {
        await new Promise(resolve => setTimeout(resolve, 10000)); // Wait 10 seconds
        attempts++;
        
        console.log(`Checking results... attempt ${attempts}`);
        
        const resultsResponse = await fetch(scrapeData.results_location, {
          headers: {
            'X-API-KEY': OUTSCRAPER_API_KEY
          }
        });
        
        if (resultsResponse.ok) {
          const resultsData = await resultsResponse.json();
          
          if (resultsData.status === 'Success' && resultsData.data) {
            finalData = resultsData;
            break;
          } else if (resultsData.status === 'Failed') {
            throw new Error('Outscraper request failed');
          }
          
          console.log(`Still pending... (${resultsData.status})`);
        }
      }
      
      if (!finalData) {
        throw new Error('Request timed out waiting for results');
      }
      
    } else if (scrapeData.data) {
      // Immediate results
      finalData = scrapeData;
    } else {
      throw new Error('No data returned from Outscraper');
    }
    
    console.log('Final scraped data:', finalData);
    
    // Step 3: Process and send reviews to Bubble
    if (!finalData.data || !finalData.data[0]) {
      console.log('No business data found');
      return { success: true, newReviews: 0, totalReviews: 0 };
    }
    
    const business = finalData.data[0];
    const allReviews = business.reviews_data || [];
    
    // Filter reviews to only include those between 4am yesterday and 4am today
    const newReviews = allReviews.filter(review => {
      if (!review.review_datetime_utc) return false;
      const reviewDate = new Date(review.review_datetime_utc);
      return reviewDate >= yesterday4am && reviewDate < today4am;
    });
    
    console.log(`Found ${allReviews.length} total reviews, ${newReviews.length} between 4am yesterday and 4am today`);
    
    if (newReviews.length === 0) {
      console.log('No new reviews in the 24-hour window');
      return { success: true, newReviews: 0, totalReviews: 0 };
    }
    
    let addedReviews = 0;
    
    for (const review of newReviews) {
      // Debug: Log the review structure to see available fields
      console.log('Processing review:', {
        author: review.review_author_name,
        author_alt: review.author_name,
        name: review.name,
        rating: review.review_rating,
        date: review.review_datetime_utc
      });
      
      // Format data for Bubble - try multiple field names for author
      const reviewerName = review.review_author_name || 
                          review.author_name || 
                          review.name || 
                          review.reviewer_name || 
                          'Anonymous';
      
      const bubbleReview = {
        rating: review.review_rating || 0,
        reviewer_name: reviewerName,
        review_text: review.review_text || '',
        review_date: review.review_datetime_utc ? new Date(review.review_datetime_utc).toISOString().split('T')[0] : new Date().toISOString().split('T')[0],
        google_review_id: review.review_id || `${reviewerName}_${review.review_datetime_utc}`
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
          addedReviews++;
          console.log(`Added review from ${bubbleReview.reviewer_name}`);
        } else {
          const errorText = await bubbleResponse.text();
          console.log(`Failed to add review from ${bubbleReview.reviewer_name}: ${errorText}`);
        }
        
        // Add small delay to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 100));
        
      } catch (error) {
        console.error('Error sending review to Bubble:', error);
      }
    }
    
    console.log(`Scraping complete. Added ${addedReviews} new reviews out of ${newReviews.length} total new reviews.`);
    return { success: true, newReviews: addedReviews, totalReviews: newReviews.length };
    
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
