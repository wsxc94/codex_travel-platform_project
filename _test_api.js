async function test() {
  // 1. Google Places API 직접 테스트
  const apiKey = process.env.GOOGLE_MAPS_API_KEY || '';
  console.log('=== Google Places API 지접 테스트 ===');
  console.log('API Key:', apiKey ? apiKey.slice(0,8) + '...' : 'MISSING');
  
  try {
    const res = await fetch('https://places.googleapis.com/v1/places:searchText', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': apiKey,
        'X-Goog-FieldMask': 'places.displayName,places.rating,places.formattedAddress,places.primaryType'
      },
      body: JSON.stringify({textQuery:'도쿄 인기 관광지',maxResultCount:5,languageCode:'ko',regionCode:'JP'})
    });
    console.log('Status:', res.status);
    const data = await res.json();
    if (data.error) {
      console.log('ERROR:', JSON.stringify(data.error, null, 2));
    } else {
      const places = data.places || [];
      console.log('Results:', places.length);
      places.forEach((p, i) => {
        console.log(`  ${i+1}. ${p.displayName?.text} | ${p.primaryType || 'N/A'} | rating: ${p.rating || 'N/A&}`);
      });
    }
  } catch (e) {
    console.log('Fetch error:', e.message);
  }

  // 2. Google Geocode API 테스트
  console.log('\n=== Google Geocode API 테스트 ===');
  try {
    const res = await fetch(`https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent('도쿄 Japan')}&key=${apiKey}&language=ko&region=jp`);
    console.log('Status:', res.status);
    const data = await res.json();
    console.log('Geocode status:', data.status);
    if (data.results?.[0]) {
      const loc = data.results[0].geometry.location;
      console.log('Location:', loc.lat, loc.lng);
      console.log('Address:', data.results[0].formatted_address);
    } else {
      console.log('No results. Error:', data.error_message || 'none');
    }
  } catch (e) {
    console.log('Geocode error:', e.message);
  }

  // 3. 서버 을 통한 맸집 API 테스트 (/api/foods)
  console.log('\n=== /api/foods 테스트 (라멩) ===');
  try {
    const res = await fetch('http://localhost:3000/api/foods?city=tokyo&genre=라믨&budget=mid');
    const data = await res.json();
    console.log('Source:', data.source);
    console.log('Warning:', data.warning || 'none');
    console.log('Results:', (data.list || []).length);
    (data.list || []).slice(0,5).forEach((p, i) => {
      console.log(`  ${i+1}. ${p.name} | ${p.genre} | score: ${p.score} | address: ${p.address || '-'}`);
    });
  } catch (e) {
    console.log('Food API error:', e.message);
  }

  // 4. 관괕지 추천 API 테스트 (/api/destinations)
  console.log('\n=== /api/destinations 테스트 (도쿄) ===');
  try {
    const res = await fetch('http://localhost:3000/api/destinations', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({city:'osaka',theme:'foodie',budget:'mid',limit:5})
    });
    const data = await res.json();
    console.log('Source:', data.source);
    console.log('Picks:', (data.picks || []).length);
    (data.picks || []).slice(0,5).forEach((p, i) => {
      console.log(`  ${i+1}. ${p.name} | ${p.category} | score: ${p.aiScore} | rating: ${p.rating || 'N/A'}`);
    });
  } catch (e) {
    console.log('Dest API error:', e.message);
  }
}

test();
