// Historical Google Reviews Scraper - One-time data collection
const fetch = require('node-fetch');

const OUTSCRAPER_API_KEY = process.env.OUTSCRAPER_API_KEY || 'ZDEwYTgxZTIxYzI2NGE1MTk4OWE2YzIxNmJmMjgzODd8N2Y3MDYzZTMxMQ';
const BUBBLE_API_URL = 'https://feedback2-15788.bubbleapps.io/api/1.1/obj';
const BUBBLE_API_TOKEN = process.env.BUBBLE_API_TOKEN || '0dfd48c46d7248ed9e3fdbf50b10a4a1';
const GOOGLE_BUSINESS_URL = 'https://www.google.com/maps/place/APPLEBEE\'s+-+Fish+%26+Seafood/@51.5051023,-0.0935601,17z/data=!4m6!3m5!1s0x487603579d38108f:0x33a6f91073961d23!8m2!3d51.505099!4d-0.0909798!16s%2Fg%2F1vmr0vx1';

async function scrapeAllHistoricalReviews() {
  try {
    console.log('Starting comprehensive historical review collection...');
    
    // Test with smaller dataset first to verify Bubble integration
    const params = new URLSearchParams({
        query: GOOGLE_BUSINESS_URL,
        reviewsLimit: 100, // Small test batch to verify Business_Metrics saves correctly
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
        const maxAttempts = 24; // Allow more time for large datasets
        
        while (attempts < maxAttempts) {
            await new Promise(resolve => setTimeout(resolve, 15000)); // Wait 15 seconds
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

    console.log('Historical data collection complete');

    if (!finalData.data || !finalData.data[0]) {
        throw new Error('No business data found');
    }

    const business = finalData.data[0];
    const allReviews = business.reviews_data || [];
    
    console.log(`Collected ${allReviews.length} historical reviews`);
    console.log('Business rating:', business.rating);
    console.log('Total reviews reported by Google:', business.reviews);

    // Analyze the historical data
    const ratingBreakdown = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    const reviewsByDate = [];
    const CUTOFF_DATE = new Date('2025-08-22T00:00:00Z');
    
    let preAugust22Reviews = [];
    let postAugust22Reviews = [];

    allReviews.forEach(review => {
        const rating = review.review_rating;
        const reviewDate = new Date(review.review_datetime_utc);
        
        if (rating >= 1 && rating <= 5) {
            ratingBreakdown[rating]++;
        }
        
        reviewsByDate.push({
            date: reviewDate,
            rating: rating
        });
        
        // Separate pre and post August 22 reviews
        if (reviewDate < CUTOFF_DATE) {
            preAugust22Reviews.push({ date: reviewDate, rating: rating });
        } else {
            postAugust22Reviews.push({ date: reviewDate, rating: rating });
        }
    });

    // Calculate pre-August 22 metrics
    let historicalWeeklyAverage = 0;
    let historicalRatingAverage = 0;
    
    if (preAugust22Reviews.length > 0) {
        preAugust22Reviews.sort((a, b) => a.date - b.date);
        
        const firstDate = preAugust22Reviews[0].date;
        const lastDate = CUTOFF_DATE;
        const daysBetween = (lastDate - firstDate) / (1000 * 60 * 60 * 24);
        const weeksBetween = daysBetween / 7;
        
        historicalWeeklyAverage = preAugust22Reviews.length / weeksBetween;
        historicalRatingAverage = preAugust22Reviews.reduce((sum, r) => sum + r.rating, 0) / preAugust22Reviews.length;
    }

    // Calculate current metrics (post-August 22)
    let currentWeeklyAverage = 0;
    let currentRatingAverage = 0;
    
    if (postAugust22Reviews.length > 0) {
        const now = new Date();
        const daysSinceAug22 = (now - CUTOFF_DATE) / (1000 * 60 * 60 * 24);
        const weeksSinceAug22 = daysSinceAug22 / 7;
        
        currentWeeklyAverage = postAugust22Reviews.length / weeksSinceAug22;
        currentRatingAverage = postAugust22Reviews.reduce((sum, r) => sum + r.rating, 0) / postAugust22Reviews.length;
    }

    // Store business metrics in new data type
    const businessMetrics = {
        total_reviews: business.reviews,
        overall_rating: business.rating,
        rating_breakdown: JSON.stringify(ratingBreakdown),
        data_as_of_date: new Date().toISOString().split('T')[0],
        reviews_per_week_historical: historicalWeeklyAverage,
        avg_rating_historical: historicalRatingAverage,
        reviews_per_week_current: currentWeeklyAverage,
        avg_rating_current: currentRatingAverage,
        pre_99_reviews_count: preAugust22Reviews.length,
        post_99_reviews_count: postAugust22Reviews.length
    };

    console.log('Historical Analysis:', {
        totalReviews: business.reviews,
        overallRating: business.rating,
        ratingBreakdown: ratingBreakdown,
        preAug22: {
            count: preAugust22Reviews.length,
            weeklyAvg: historicalWeeklyAverage.toFixed(2),
            ratingAvg: historicalRatingAverage.toFixed(2)
        },
        postAug22: {
            count: postAugust22Reviews.length,
            weeklyAvg: currentWeeklyAverage.toFixed(2),
            ratingAvg: currentRatingAverage.toFixed(2)
        }
    });

    // Send business metrics to Bubble
    try {
        const metricsResponse = await fetch(`${BUBBLE_API_URL}/Business_Metrics?api_token=${BUBBLE_API_TOKEN}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(businessMetrics)
        });

        if (metricsResponse.ok) {
            console.log('Business metrics saved successfully');
        } else {
            const errorText = await metricsResponse.text();
            console.log('Failed to save business metrics:', errorText);
        }
    } catch (error) {
        console.error('Error saving business metrics:', error);
    }

    // Store individual historical reviews
    let savedReviews = 0;
    console.log('Saving individual reviews...');
    
    for (const review of allReviews) {
        const reviewData = {
            rating: review.review_rating,
            reviewer_name: review.author_title || 'Anonymous',
            review_text: review.review_text || '',
            review_date: review.review_datetime_utc ? new Date(review.review_datetime_utc).toISOString().split('T')[0] : new Date().toISOString().split('T')[0],
            google_review_id: review.review_id || `${review.author_title}_${review.review_datetime_utc}`
        };

        try {
            const reviewResponse = await fetch(`${BUBBLE_API_URL}/Google_Review?api_token=${BUBBLE_API_TOKEN}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(reviewData)
            });

            if (reviewResponse.ok) {
                savedReviews++;
            } else {
                // Review might already exist, that's okay
                console.log(`Skipped duplicate review: ${reviewData.reviewer_name}`);
            }

            // Small delay to avoid overwhelming the API
            await new Promise(resolve => setTimeout(resolve, 50));
        } catch (error) {
            console.error('Error saving individual review:', error);
        }
    }

    console.log(`Historical data collection complete. Saved ${savedReviews} reviews and business metrics.`);
    return { 
        success: true, 
        totalReviews: allReviews.length, 
        savedReviews: savedReviews,
        businessMetrics: businessMetrics 
    };

  } catch (error) {
    console.error('Historical data collection failed:', error);
    return { success: false, error: error.message };
  }
}

// Run the historical collection
if (require.main === module) {
  console.log('Starting one-time historical data collection...');
  scrapeAllHistoricalReviews().then(result => {
    console.log('Final result:', result);
    process.exit(result.success ? 0 : 1);
  });
}

module.exports = { scrapeAllHistoricalReviews };
