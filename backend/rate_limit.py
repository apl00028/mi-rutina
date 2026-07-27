from collections import defaultdict, deque
from threading import Lock
import time
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
