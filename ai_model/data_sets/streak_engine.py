"""Daily streak tracking."""

from datetime import date, datetime, timedelta


class StreakEngine:
    def update(self, last_active=None, current_streak=0, today=None):
        today_date = self._to_date(today) or date.today()
        last_date = self._to_date(last_active)
        if not last_date:
            return {"streak": 1, "lastActive": today_date.isoformat(), "status": "started"}
        if last_date == today_date:
            return {"streak": current_streak or 1, "lastActive": today_date.isoformat(), "status": "same_day"}
        if last_date == today_date - timedelta(days=1):
            return {"streak": current_streak + 1, "lastActive": today_date.isoformat(), "status": "continued"}
        return {"streak": 1, "lastActive": today_date.isoformat(), "status": "reset"}

    def _to_date(self, value):
        if not value:
            return None
        if isinstance(value, date):
            return value
        try:
            return datetime.fromisoformat(str(value)[:10]).date()
        except ValueError:
            return None
