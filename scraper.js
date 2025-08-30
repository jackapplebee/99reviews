// Import fetch for Node.js compatibility
const fetch = require('node-fetch');

// Google Reviews Scraper - Outscraper to Bubble Integration
const OUTSCRAPER_API_KEY = process.env.OUTSCRAPER_API_KEY || 'ZDEwYTgxZTIxYzI2NGE1MTk4OWE2YzIxNmJmMjgzODd8N2Y3MDYzZTMxMQ';
const BUBBLE_API_URL = 'https://feedback2-15788.bubbleapps.io/api/1.1/obj/Google_Review';
const BUBBLE_API_TOKEN = process.env.BUBBLE_API_TOKEN || '0dfd48c46d7248ed9e3fdbf50b10a4a1';
const GOOGLE_BUSINESS_URL = 'https://www.google.com/maps/place/APPLEBEE\'s+-+Fish+%26+Seafood/@51.5051023,-0.0935601,17z/data=!4m6!3m5!1s0x487603579d38108f:0x33a6f91073961d23!8m2!3d51.505099!4d-0.0909798!16s%2Fg%2F1vmr0vx1';

async function scrapeGoogleReviews() {
  try {
    console.log('Starting Google Reviews scrape...');
    
    // Set up 24-hour window from 4am yesterday to 4am today (London time)
    const now = new Date();
    const today4am = new Date();
    today4am.setHours(4, 0, 0, 0);
    const yesterday4am = new Date(today4am);
    yesterday4am.setDate(yesterday4am.getDate() - 1);
    
    console.log(`Looking for reviews between: ${yesterday4am.toISOString()} and ${today4am.toISOString()}`);
    
    // Initiate scraping request to Outscraper (using GET method)
    const params = new URLSearchParams({
        query: GOOGLE_BUSINESS_URL,
        reviewsLimit: 10, // Changed from 50 to 10
        language: 'en',
        region: 'GB',
        sort: 'newest'
    });
    
    const response = await fetch(`https://api.outscraper.com/maps/reviews-v3?${params}`, {
        method: 'GET',
        headers: {
            'X-API-KEY': OUTSCRAPER_API_KEY
        }
    });

    if (!response.ok) {
        throw new Error(`Outscraper API error: ${response.status}`);
    }

    const data = await response.json();
    console.log('Initial response:', data);

    // Handle async response pattern
    let finalData;
    if (data.status === 'Pending' && data.results_location) {
        console.log('Request is pending, waiting for results...');
        
        let attempts = 0;
        const maxAttempts = 12;
        
        while (attempts < maxAttempts) {
            await new Promise(resolve => setTimeout(resolve, 10000));
            attempts++;
            
            console.log(`Checking results... attempt ${attempts}`);
            
            const resultsResponse = await fetch(data.results_location, {
                headers: { 'X-API-KEY': OUTSCRAPER_API_KEY }
            });
            
            if (resultsResponse.ok) {
                const resultsData = await resultsResponse.json();
                
                if (resultsData.status === 'Success' && resultsData.data) {
                    finalData = resultsData;
                    break;
                } else if (resultsData.status === 'Failed') {
                    throw new Error('Outscraper request failed');
                }
            }
        }
        
        if (!finalData) {
            throw new Error('Request timed out');
        }
    } else if (data.data) {
        finalData = data;
    } else {
        throw new Error('No data returned');
    }

    console.log('Final scraped data:', JSON.stringify(finalData, null, 2));

    if (!finalData.data || !finalData.data[0]) {
        return { success: true, newReviews: 0, totalReviews: 0 };
    }

    const business = finalData.data[0];
    const allReviews = business.reviews_data || [];
    
    // Filter reviews to 24-hour window
    const reviewsInRange = allReviews.filter(review => {
        if (!review.date) return false;
        const reviewDate = new Date(review.date);
        return reviewDate >= yesterday4am && reviewDate < today4am;
    });

    const totalReviews = allReviews.length;
    const newReviews = reviewsInRange.length;
    
    console.log(`Found ${totalReviews} total reviews, ${newReviews} between 4am yesterday and 4am today`);

    for (const review of reviewsInRange) {
        // Comprehensive debugging for the FIRST review only
        if (reviewsInRange.indexOf(review) === 0) {
            console.log('\n=== COMPLETE REVIEW DEBUG ===');
            console.log('All available fields:', Object.keys(review));
            console.log('Complete review object:');
            for (const [key, value] of Object.entries(review)) {
                console.log(`  ${key}: ${JSON.stringify(value)}`);
            }
            console.log('=== END DEBUG ===\n');
        }
        
        // Try all possible name fields
        const possibleNameFields = [
            'author', 'author_name', 'name', 'reviewer_name', 'reviewer',
            'review_author', 'review_author_name', 'author_alt', 'user_name',
            'customer_name', 'profile_name', 'display_name'
        ];
        
        let reviewerName = 'Anonymous';
        
        // Check direct fields
        for (const field of possibleNameFields) {
            if (review[field] && review[field] !== '') {
                reviewerName = review[field];
                console.log(`✓ Found reviewer name in field '${field}': ${reviewerName}`);
                break;
            }
        }
        
        // Check nested objects
        if (reviewerName === 'Anonymous') {
            if (review.author_profile && review.author_profile.name) {
                reviewerName = review.author_profile.name;
                console.log(`✓ Found reviewer name in author_profile.name: ${reviewerName}`);
            } else if (review.profile && review.profile.name) {
                reviewerName = review.profile.name;
                console.log(`✓ Found reviewer name in profile.name: ${reviewerName}`);
            }
        }
        
        if (reviewerName === 'Anonymous') {
            console.log('⚠ No reviewer name found, using Anonymous');
        }

        const reviewData = {
            rating: review.rating,
            reviewer_name: reviewerName,
            review_text: review.text || review.review_text || review.comment || '',
            review_date: review.date,
            google_review_id: review.review_id || review.id || `${review.date}_${review.rating}_${reviewerName}`
        };

        // Send to Bubble
        try {
            const bubbleResponse = await fetch(`${BUBBLE_API_URL}?api_token=${BUBBLE_API_TOKEN}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(reviewData)
            });

            if (bubbleResponse.ok) {
                console.log(`Added review from ${reviewData.reviewer_name}`);
            } else {
                const errorText = await bubbleResponse.text();
                console.log(`Failed to add review: ${errorText}`);
            }

            await new Promise(resolve => setTimeout(resolve, 100));
        } catch (error) {
            console.error('Error sending review to Bubble:', error);
        }
    }

    console.log(`Scraping complete. Added ${newReviews} new reviews out of ${newReviews} total new reviews.`);
    return { success: true, newReviews: newReviews, totalReviews: totalReviews };

  } catch (error) {
    console.error('Scraping failed:', error);
    return { success: false, error: error.message };
  }
}

// Auto-run when executed directly
if (require.main === module) {
  console.log('Starting automated Google Reviews scraper...');
  scrapeGoogleReviews().then(result => {
    console.log('Final result:', result);
    process.exit(result.success ? 0 : 1);
  });
}

module.exports = { scrapeGoogleReviews };
