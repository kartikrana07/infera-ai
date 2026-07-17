class RouterAgent:

    @staticmethod
    def route(user_message: str):
        msg = user_message.lower()

        web_keywords = [
            "jobs", "job", "hiring", "vacancy", "salary", "market",
            "latest", "today", "current", "news", "source", "sources",
            "link", "links", "mumbai", "bangalore", "delhi", "pune",
            "how many jobs", "kitni jobs", "available jobs"
        ]

        code_keywords = [
            "write code", "source code", "program", "make code",
            "fix error", "bug", "debug", "explain code",
            "python code", "html code", "css code", "javascript code",
            "create function", "algorithm"
        ]

        # Web check FIRST because "python developer jobs" contains python,
        # but it is a job/search query, not a coding query.
        if any(word in msg for word in web_keywords):
            return "web"

        if any(word in msg for word in code_keywords):
            return "code"

        return "chat"