from tavily import TavilyClient
from app.core.config import settings

client = TavilyClient(api_key=settings.TAVILY_API_KEY)


class TavilyService:

    @staticmethod
    def search(query: str):

        try:
            response = client.search(
                query=query,
                search_depth="advanced",
                max_results=8
            )
        except Exception as error:
            print("TAVILY SEARCH ERROR:", str(error))
            return {"results": []}

        return response
