import http from 'k6/http';
import { sleep, check } from 'k6';
import { htmlReport } from 'https://raw.githubusercontent.com/benc-uk/k6-reporter/main/dist/bundle.js';

export const options = {
  stages: [
    { duration: '10s', target: 10 }, // Ramp-up to 10 users over 10s seconds
    { duration: '1m', target: 20 }, // Stay at 20 users for 1 minute
    { duration: '30s', target: 0 }, // Ramp-down to 0 users over 30 seconds
  ],

  thresholds: {
    http_req_duration: ['p(95)<500'], // 95% of requests must complete below 500ms
  },
};  
 



export default function () {
 const response = http.get('https://www.saucedemo.com/');

  check(response, {
    'is status 200': (r) => r.status === 200 
  });
    sleep(1);
}




export function handleSummary(data) {
  return {
    "report.html": htmlReport(data),
  };
}
