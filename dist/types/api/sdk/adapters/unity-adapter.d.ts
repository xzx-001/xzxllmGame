import type { LevelResult } from '../types.js';
export interface UnityAdapterConfig {
    serverUrl: string;
    apiKey: string;
    timeout: number;
    debugMode: boolean;
}
export interface UnityLevelData {
    levelId: string;
    difficulty: number;
    mapWidth: number;
    mapHeight: number;
    theme: string;
    startX: number;
    startY: number;
    exitX: number;
    exitY: number;
    miniGames: UnityMiniGameData[];
    narrativeText: string;
    dialoguesJson: string;
}
export interface UnityMiniGameData {
    id: string;
    type: string;
    x: number;
    y: number;
    width: number;
    height: number;
    configJson: string;
}
export declare class UnityAdapter {
    private sdk;
    private config;
    constructor(config: UnityAdapterConfig);
    initialize(): Promise<boolean>;
    requestLevel(playerId: string, sessionId: string, difficulty?: number, theme?: string): Promise<UnityLevelData | null>;
    submitLevelResult(result: LevelResult): Promise<boolean>;
    getPlayerProfile(playerId: string): Promise<any | null>;
    private convertToUnityLevel;
    dispose(): Promise<void>;
    private log;
    private error;
}
export declare const UNITY_CSHARP_EXAMPLE = "\nusing System;\nusing System.Threading.Tasks;\nusing UnityEngine;\nusing UnityEngine.Networking;\n\nnamespace XZXLLMGame\n{\n    /// <summary>\n    /// xzxllmGame SDK \u7684 Unity C# \u5C01\u88C5\n    /// </summary>\n    public class XZXLLMGameClient : MonoBehaviour\n    {\n        [Header(\"Server Configuration\")]\n        [SerializeField] private string serverUrl = \"http://localhost:3000\";\n        [SerializeField] private string apiKey = \"\";\n        [SerializeField] private float timeout = 30f;\n        [SerializeField] private bool debugMode = false;\n\n        private bool isInitialized = false;\n\n        /// <summary>\n        /// \u521D\u59CB\u5316 SDK\n        /// </summary>\n        public async Task<bool> Initialize()\n        {\n            try\n            {\n                // \u9A8C\u8BC1\u670D\u52A1\u5668\u8FDE\u63A5\n                bool isHealthy = await HealthCheck();\n                isInitialized = isHealthy;\n                return isHealthy;\n            }\n            catch (Exception ex)\n            {\n                Debug.LogError($\"[XZXLLMGame] Initialization failed: {ex.Message}\");\n                return false;\n            }\n        }\n\n        /// <summary>\n        /// \u8BF7\u6C42\u751F\u6210\u65B0\u5173\u5361\n        /// </summary>\n        public async Task<LevelData> RequestLevel(\n            string playerId,\n            string sessionId,\n            float? difficulty = null,\n            string theme = null)\n        {\n            if (!isInitialized)\n            {\n                Debug.LogError(\"[XZXLLMGame] Not initialized\");\n                return null;\n            }\n\n            var requestData = new LevelRequest\n            {\n                playerId = playerId,\n                sessionId = sessionId,\n                difficulty = difficulty,\n                theme = theme\n            };\n\n            string json = JsonUtility.ToJson(requestData);\n            byte[] bodyRaw = System.Text.Encoding.UTF8.GetBytes(json);\n\n            using (UnityWebRequest request = new UnityWebRequest(\n                $\"{serverUrl}/api/levels\", \"POST\"))\n            {\n                request.uploadHandler = new UploadHandlerRaw(bodyRaw);\n                request.downloadHandler = new DownloadHandlerBuffer();\n                request.SetRequestHeader(\"Content-Type\", \"application/json\");\n                request.SetRequestHeader(\"X-API-Key\", apiKey);\n                request.timeout = (int)timeout;\n\n                await request.SendWebRequest();\n\n                if (request.result == UnityWebRequest.Result.Success)\n                {\n                    string responseJson = request.downloadHandler.text;\n                    var response = JsonUtility.FromJson<ApiResponse<LevelData>>(responseJson);\n                    return response.data;\n                }\n                else\n                {\n                    Debug.LogError($\"[XZXLLMGame] Request failed: {request.error}\");\n                    return null;\n                }\n            }\n        }\n\n        /// <summary>\n        /// \u63D0\u4EA4\u5173\u5361\u7ED3\u679C\n        /// </summary>\n        public async Task<bool> SubmitLevelResult(LevelResult result)\n        {\n            if (!isInitialized) return false;\n\n            string json = JsonUtility.ToJson(result);\n            byte[] bodyRaw = System.Text.Encoding.UTF8.GetBytes(json);\n\n            using (UnityWebRequest request = new UnityWebRequest(\n                $\"{serverUrl}/api/feedback\", \"POST\"))\n            {\n                request.uploadHandler = new UploadHandlerRaw(bodyRaw);\n                request.downloadHandler = new DownloadHandlerBuffer();\n                request.SetRequestHeader(\"Content-Type\", \"application/json\");\n                request.SetRequestHeader(\"X-API-Key\", apiKey);\n\n                await request.SendWebRequest();\n                return request.result == UnityWebRequest.Result.Success;\n            }\n        }\n\n        /// <summary>\n        /// \u5065\u5EB7\u68C0\u67E5\n        /// </summary>\n        public async Task<bool> HealthCheck()\n        {\n            using (UnityWebRequest request = UnityWebRequest.Get($\"{serverUrl}/health\"))\n            {\n                await request.SendWebRequest();\n                return request.result == UnityWebRequest.Result.Success;\n            }\n        }\n    }\n\n    // \u6570\u636E\u7C7B\u5B9A\u4E49\n    [Serializable]\n    public class LevelRequest\n    {\n        public string playerId;\n        public string sessionId;\n        public float? difficulty;\n        public string theme;\n    }\n\n    [Serializable]\n    public class ApiResponse<T>\n    {\n        public bool success;\n        public T data;\n        public ApiError error;\n    }\n\n    [Serializable]\n    public class ApiError\n    {\n        public string code;\n        public string message;\n    }\n\n    [Serializable]\n    public class LevelData\n    {\n        public LevelMetadata metadata;\n        public BaseMapConfig baseMap;\n        public MiniGameData[] miniGames;\n        public string narrativeBridge;\n    }\n\n    [Serializable]\n    public class LevelMetadata\n    {\n        public string id;\n        public string version;\n        public float totalDifficulty;\n    }\n\n    [Serializable]\n    public class BaseMapConfig\n    {\n        public int[] size;\n        public string theme;\n        public Position playerStart;\n        public Position exitPosition;\n    }\n\n    [Serializable]\n    public class Position\n    {\n        public int x;\n        public int y;\n    }\n\n    [Serializable]\n    public class MiniGameData\n    {\n        public string id;\n        public string type;\n        public Bounds bounds;\n    }\n\n    [Serializable]\n    public class Bounds\n    {\n        public int x;\n        public int y;\n        public int w;\n        public int h;\n    }\n\n    [Serializable]\n    public class LevelResult\n    {\n        public string levelId;\n        public float completionTime;\n        public int attempts;\n        public bool success;\n        public int hintsUsed;\n        public int? rating;\n    }\n}\n";
export { UNITY_CSHARP_EXAMPLE as UnityCSharpExample, };
export default UnityAdapter;
//# sourceMappingURL=unity-adapter.d.ts.map