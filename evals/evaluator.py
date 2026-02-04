"""Simple evaluator class for API calls and metrics."""

import asyncio
import httpx

API_URL = "http://localhost:3000/api/evaluate"
CONCURRENT = 10
TIMEOUT = 60


def is_exact_match(r):
    """Check if prediction exactly matches expected."""
    return (set(r["expected_flags"]) == set(r["actual_flags"]) and 
            r["expected_is_flagged"] == r["actual_is_flagged"])


class Evaluator:
    def __init__(self, prompt):
        self.prompt = prompt
    
    async def _call_api(self, client, msg, semaphore):
        async with semaphore:
            flags = [{"name": n, "description": d, "enabled": True} 
                     for n, d in msg["flag_definitions"].items()]
            try:
                resp = await client.post(API_URL, json={
                    "message": msg["message"],
                    "coachingFlags": flags,
                    "includeReasoning": True,
                    "prompt": self.prompt,
                }, timeout=TIMEOUT)
                resp.raise_for_status()
                data = resp.json()
                return {
                    "id": msg["id"],
                    "message": msg["message"],
                    "expected_flags": msg["expected_flags"],
                    "expected_is_flagged": msg["isFlagged"],
                    "actual_flags": data.get("flags", []),
                    "actual_is_flagged": data.get("flagged", False),
                    "reasoning": data.get("reasoning"),
                    "flag_definitions": msg["flag_definitions"],
                }
            except Exception as e:
                return {
                    "id": msg["id"],
                    "message": msg["message"],
                    "expected_flags": msg["expected_flags"],
                    "expected_is_flagged": msg["isFlagged"],
                    "actual_flags": [],
                    "actual_is_flagged": False,
                    "reasoning": f"Error: {e}",
                    "flag_definitions": msg["flag_definitions"],
                }
    
    async def run(self, messages):
        semaphore = asyncio.Semaphore(CONCURRENT)
        async with httpx.AsyncClient() as client:
            tasks = [self._call_api(client, m, semaphore) for m in messages]
            results = []
            for i, coro in enumerate(asyncio.as_completed(tasks)):
                results.append(await coro)
                if (i + 1) % 10 == 0 or (i + 1) == len(tasks):
                    print(f"  Progress: {i + 1}/{len(tasks)}")
        return results
    
    def get_metrics(self, results):
        total = len(results)
        exact = sum(1 for r in results if is_exact_match(r))
        return {
            "total": total,
            "exact": exact,
            "accuracy": round(exact / total * 100, 2) if total else 0,
        }
    
    def get_wrong(self, results):
        return [r for r in results if not is_exact_match(r)]
