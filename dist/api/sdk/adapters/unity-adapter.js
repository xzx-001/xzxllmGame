import { createSDK } from '../game-client-sdk.js';
export class UnityAdapter {
    sdk = null;
    config;
    constructor(config) {
        this.config = config;
    }
    async initialize() {
        try {
            const sdkConfig = {
                apiEndpoint: this.config.serverUrl,
                apiKey: this.config.apiKey,
                timeout: this.config.timeout * 1000,
                debug: this.config.debugMode,
                logLevel: this.config.debugMode ? 'debug' : 'info',
            };
            this.sdk = createSDK(sdkConfig);
            await this.sdk.initialize();
            this.log('UnityAdapter initialized successfully');
            return true;
        }
        catch (error) {
            this.error('Failed to initialize UnityAdapter:', error.message);
            return false;
        }
    }
    async requestLevel(playerId, sessionId, difficulty, theme) {
        if (!this.sdk) {
            this.error('UnityAdapter not initialized');
            return null;
        }
        try {
            const level = await this.sdk.requestLevel(playerId, sessionId, {
                ...(difficulty !== undefined && { difficulty }),
                ...(theme !== undefined && { theme }),
            });
            return this.convertToUnityLevel(level);
        }
        catch (error) {
            this.error('Failed to request level:', error.message);
            return null;
        }
    }
    async submitLevelResult(result) {
        if (!this.sdk) {
            this.error('UnityAdapter not initialized');
            return false;
        }
        try {
            return await this.sdk.submitLevelResult(result);
        }
        catch (error) {
            this.error('Failed to submit level result:', error.message);
            return false;
        }
    }
    async getPlayerProfile(playerId) {
        if (!this.sdk) {
            return null;
        }
        return await this.sdk.getPlayerProfile(playerId);
    }
    convertToUnityLevel(level) {
        const [width, height] = level.baseMap.size;
        return {
            levelId: level.metadata.id,
            difficulty: level.metadata.totalDifficulty,
            mapWidth: width,
            mapHeight: height,
            theme: level.baseMap.theme,
            startX: level.baseMap.playerStart.x,
            startY: level.baseMap.playerStart.y,
            exitX: level.baseMap.exitPosition.x,
            exitY: level.baseMap.exitPosition.y,
            miniGames: level.miniGames.map((mg) => ({
                id: mg.id,
                type: mg.type,
                x: mg.bounds.x,
                y: mg.bounds.y,
                width: mg.bounds.w,
                height: mg.bounds.h,
                configJson: JSON.stringify(mg.config),
            })),
            narrativeText: level.narrativeBridge,
            dialoguesJson: JSON.stringify(level.dialogues),
        };
    }
    async dispose() {
        if (this.sdk) {
            await this.sdk.dispose();
            this.sdk = null;
        }
        this.log('UnityAdapter disposed');
    }
    log(...args) {
        if (this.config.debugMode) {
            console.log('[UnityAdapter]', ...args);
        }
    }
    error(...args) {
        console.error('[UnityAdapter]', ...args);
    }
}
export const UNITY_CSHARP_EXAMPLE = `
using System;
using System.Threading.Tasks;
using UnityEngine;
using UnityEngine.Networking;

namespace XZXLLMGame
{
    /// <summary>
    /// xzxllmGame SDK 的 Unity C# 封装
    /// </summary>
    public class XZXLLMGameClient : MonoBehaviour
    {
        [Header("Server Configuration")]
        [SerializeField] private string serverUrl = "http://localhost:3000";
        [SerializeField] private string apiKey = "";
        [SerializeField] private float timeout = 30f;
        [SerializeField] private bool debugMode = false;

        private bool isInitialized = false;

        /// <summary>
        /// 初始化 SDK
        /// </summary>
        public async Task<bool> Initialize()
        {
            try
            {
                // 验证服务器连接
                bool isHealthy = await HealthCheck();
                isInitialized = isHealthy;
                return isHealthy;
            }
            catch (Exception ex)
            {
                Debug.LogError($"[XZXLLMGame] Initialization failed: {ex.Message}");
                return false;
            }
        }

        /// <summary>
        /// 请求生成新关卡
        /// </summary>
        public async Task<LevelData> RequestLevel(
            string playerId,
            string sessionId,
            float? difficulty = null,
            string theme = null)
        {
            if (!isInitialized)
            {
                Debug.LogError("[XZXLLMGame] Not initialized");
                return null;
            }

            var requestData = new LevelRequest
            {
                playerId = playerId,
                sessionId = sessionId,
                difficulty = difficulty,
                theme = theme
            };

            string json = JsonUtility.ToJson(requestData);
            byte[] bodyRaw = System.Text.Encoding.UTF8.GetBytes(json);

            using (UnityWebRequest request = new UnityWebRequest(
                $"{serverUrl}/api/levels", "POST"))
            {
                request.uploadHandler = new UploadHandlerRaw(bodyRaw);
                request.downloadHandler = new DownloadHandlerBuffer();
                request.SetRequestHeader("Content-Type", "application/json");
                request.SetRequestHeader("X-API-Key", apiKey);
                request.timeout = (int)timeout;

                await request.SendWebRequest();

                if (request.result == UnityWebRequest.Result.Success)
                {
                    string responseJson = request.downloadHandler.text;
                    var response = JsonUtility.FromJson<ApiResponse<LevelData>>(responseJson);
                    return response.data;
                }
                else
                {
                    Debug.LogError($"[XZXLLMGame] Request failed: {request.error}");
                    return null;
                }
            }
        }

        /// <summary>
        /// 提交关卡结果
        /// </summary>
        public async Task<bool> SubmitLevelResult(LevelResult result)
        {
            if (!isInitialized) return false;

            string json = JsonUtility.ToJson(result);
            byte[] bodyRaw = System.Text.Encoding.UTF8.GetBytes(json);

            using (UnityWebRequest request = new UnityWebRequest(
                $"{serverUrl}/api/feedback", "POST"))
            {
                request.uploadHandler = new UploadHandlerRaw(bodyRaw);
                request.downloadHandler = new DownloadHandlerBuffer();
                request.SetRequestHeader("Content-Type", "application/json");
                request.SetRequestHeader("X-API-Key", apiKey);

                await request.SendWebRequest();
                return request.result == UnityWebRequest.Result.Success;
            }
        }

        /// <summary>
        /// 健康检查
        /// </summary>
        public async Task<bool> HealthCheck()
        {
            using (UnityWebRequest request = UnityWebRequest.Get($"{serverUrl}/health"))
            {
                await request.SendWebRequest();
                return request.result == UnityWebRequest.Result.Success;
            }
        }
    }

    // 数据类定义
    [Serializable]
    public class LevelRequest
    {
        public string playerId;
        public string sessionId;
        public float? difficulty;
        public string theme;
    }

    [Serializable]
    public class ApiResponse<T>
    {
        public bool success;
        public T data;
        public ApiError error;
    }

    [Serializable]
    public class ApiError
    {
        public string code;
        public string message;
    }

    [Serializable]
    public class LevelData
    {
        public LevelMetadata metadata;
        public BaseMapConfig baseMap;
        public MiniGameData[] miniGames;
        public string narrativeBridge;
    }

    [Serializable]
    public class LevelMetadata
    {
        public string id;
        public string version;
        public float totalDifficulty;
    }

    [Serializable]
    public class BaseMapConfig
    {
        public int[] size;
        public string theme;
        public Position playerStart;
        public Position exitPosition;
    }

    [Serializable]
    public class Position
    {
        public int x;
        public int y;
    }

    [Serializable]
    public class MiniGameData
    {
        public string id;
        public string type;
        public Bounds bounds;
    }

    [Serializable]
    public class Bounds
    {
        public int x;
        public int y;
        public int w;
        public int h;
    }

    [Serializable]
    public class LevelResult
    {
        public string levelId;
        public float completionTime;
        public int attempts;
        public bool success;
        public int hintsUsed;
        public int? rating;
    }
}
`;
export { UNITY_CSHARP_EXAMPLE as UnityCSharpExample, };
export default UnityAdapter;
//# sourceMappingURL=unity-adapter.js.map