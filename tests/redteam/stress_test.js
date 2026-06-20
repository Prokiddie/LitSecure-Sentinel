import http from 'k6/http';
import { check, sleep } from 'k6';

export let options = {
    stages: [
        { duration: '30s', target: 50 },
        { duration: '1m', target: 200 },
        { duration: '30s', target: 0 }
    ]
};

export default function () {
    let payload = JSON.stringify({
        title: "stress-test-" + Math.random(),
        description: "load testing incident ingestion endpoint with long description context to satisfy validations",
        reporterName: "Load Tester",
        reporterContact: "load@secure.mw"
    });

    let res = http.post('http://localhost:3000/api/public/report', payload, {
        headers: { 'Content-Type': 'application/json' }
    });

    check(res, {
        'status is 200, 201, 400 or 429': (r) => [200, 201, 400, 429].includes(r.status)
    });

    sleep(1);
}
