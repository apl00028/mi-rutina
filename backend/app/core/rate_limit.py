from collections import defaultdict, deque
from threading import Lock
import time
import os
from datetime import date
from fastapi import HTTPException, status

class SlidingWindowRateLimiter:
    def __init__(self,requests=20,window_seconds=60):
        self.requests=requests;self.window_seconds=window_seconds;self.events=defaultdict(deque);self.lock=Lock()
    def check(self,key):
        now=time.monotonic();cutoff=now-self.window_seconds
        with self.lock:
            events=self.events[key]
            while events and events[0]<=cutoff: events.popleft()
            if len(events)>=self.requests: raise HTTPException(status_code=status.HTTP_429_TOO_MANY_REQUESTS,detail="Rate limit exceeded")
            events.append(now)
coach_rate_limiter=SlidingWindowRateLimiter()

class DailyUserRateLimiter:
    def __init__(self, requests=10):
        self.requests=requests
        self.counts=defaultdict(int)
        self.lock=Lock()

    def check(self, user_id):
        key=(str(user_id),date.today().isoformat())
        with self.lock:
            if self.counts[key]>=self.requests:
                raise HTTPException(
                    status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                    detail="Daily AI limit exceeded",
                )
            self.counts[key]+=1

ai_daily_rate_limiter=DailyUserRateLimiter(
    requests=max(1,int(os.getenv("AI_DAILY_LIMIT_PER_USER","10")))
)
