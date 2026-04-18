// src/api/sdk/adapters/unity-adapter.ts
/**
 * @fileoverview Unity 引擎适配器
 * @description 为 Unity C# 项目提供调用 xzxllmGame SDK 的辅助类和示例代码
 * @module api/sdk/adapters/unity-adapter
 * @author xzxllm
 * @license MIT
 *
 * @remarks
 * 此文件为 TypeScript 实现的参考代码，供 Unity 开发者参考如何将 SDK 集成到 C# 项目中。
 * 实际使用时需要将此逻辑转换为 C# 代码。
 */

import { GameClientSDK, createSDK } from '../game-client-sdk.js';
import type { SDKConfig, LevelStructure, LevelResult } from '../types.js';

/**
 * Unity 适配器配置
 * 对应 Unity 项目中的配置结构
 */
export interface UnityAdapterConfig {
  /** 服务器地址 */
  serverUrl: string;
  /** API 密钥 */
  apiKey: string;
  /** 连接超时（秒） */
  timeout: number;
  /** 是否启用调试日志 */
  debugMode: boolean;
}

/**
 * Unity 关卡数据
 * 用于在 Unity 中序列化的关卡结构
 */
export interface UnityLevelData {
  /** 关卡 ID */
  levelId: string;
  /** 难度等级 0-1 */
  difficulty: number;
  /** 地图宽度 */
  mapWidth: number;
  /** 地图高度 */
  mapHeight: number;
  /** 主题名称 */
  theme: string;
  /** 玩家起始位置 X */
  startX: number;
  /** 玩家起始位置 Y */
  startY: number;
  /** 出口位置 X */
  exitX: number;
  /** 出口位置 Y */
  exitY: number;
  /** 小游戏区域列表 */
  miniGames: UnityMiniGameData[];
  /** 开场白文本 */
  narrativeText: string;
  /** 对话树 JSON */
  dialoguesJson: string;
}

/**
 * Unity 小游戏数据
 */
export interface UnityMiniGameData {
  /** 区域 ID */
  id: string;
  /** 游戏类型 */
  type: string;
  /** 区域位置 X */
  x: number;
  /** 区域位置 Y */
  y: number;
  /** 区域宽度 */
  width: number;
  /** 区域高度 */
  height: number;
  /** 游戏配置 JSON */
  configJson: string;
}

/**
 * Unity 引擎适配器类
 *
 * 为 Unity 项目提供简化的接口。
 * 注意：此类展示 TypeScript 实现，Unity C# 项目需要参考此逻辑自行实现。
 */
export class UnityAdapter {
  private sdk: GameClientSDK | null = null;
  private config: UnityAdapterConfig;

  /**
   * 创建 Unity 适配器实例
   * @param config Unity 适配器配置
   */
  constructor(config: UnityAdapterConfig) {
    this.config = config;
  }

  /**
   * 初始化适配器
   * 在 Unity 的 Start() 或 Awake() 中调用
   */
  async initialize(): Promise<boolean> {
    try {
      const sdkConfig: SDKConfig = {
        apiEndpoint: this.config.serverUrl,
        apiKey: this.config.apiKey,
        timeout: this.config.timeout * 1000, // 转换为毫秒
        debug: this.config.debugMode,
        logLevel: this.config.debugMode ? 'debug' : 'info',
      };

      this.sdk = createSDK(sdkConfig);
      await this.sdk.initialize();

      this.log('UnityAdapter initialized successfully');
      return true;
    } catch (error: any) {
      this.error('Failed to initialize UnityAdapter:', error.message);
      return false;
    }
  }

  /**
   * 请求新关卡
   * 在 Unity 中异步调用，完成后通过回调或事件通知游戏逻辑
   *
   * @param playerId 玩家 ID
   * @param sessionId 会话 ID
   * @param difficulty 难度等级 0.0-1.0
   * @param theme 主题名称
   * @returns Unity 格式的关卡数据
   */
  async requestLevel(
    playerId: string,
    sessionId: string,
    difficulty?: number,
    theme?: string
  ): Promise<UnityLevelData | null> {
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
    } catch (error: any) {
      this.error('Failed to request level:', error.message);
      return null;
    }
  }

  /**
   * 提交关卡结果
   * 在玩家完成或放弃关卡后调用
   *
   * @param result 关卡结果数据
   */
  async submitLevelResult(result: LevelResult): Promise<boolean> {
    if (!this.sdk) {
      this.error('UnityAdapter not initialized');
      return false;
    }

    try {
      return await this.sdk.submitLevelResult(result);
    } catch (error: any) {
      this.error('Failed to submit level result:', error.message);
      return false;
    }
  }

  /**
   * 获取玩家数据
   * @param playerId 玩家 ID
   */
  async getPlayerProfile(playerId: string): Promise<any | null> {
    if (!this.sdk) {
      return null;
    }

    return await this.sdk.getPlayerProfile(playerId);
  }

  /**
   * 将 SDK 关卡数据转换为 Unity 格式
   */
  private convertToUnityLevel(level: LevelStructure): UnityLevelData {
    const [width, height] = level.baseMap.size;

    return {
      levelId: level.metadata.id,
      difficulty: level.metadata.totalDifficulty,
      mapWidth: width,
      mapHeight: height,
      theme: level.baseMap.theme as string,
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

  /**
   * 销毁适配器
   * 在 Unity 的 OnDestroy() 中调用
   */
  async dispose(): Promise<void> {
    if (this.sdk) {
      await this.sdk.dispose();
      this.sdk = null;
    }
    this.log('UnityAdapter disposed');
  }

  /**
   * 输出日志
   */
  private log(...args: any[]): void {
    if (this.config.debugMode) {
      console.log('[UnityAdapter]', ...args);
    }
  }

  /**
   * 输出错误
   */
  private error(...args: any[]): void {
    console.error('[UnityAdapter]', ...args);
  }
}

/**
 * Unity C# 集成示例代码
 * 此字符串包含可在 Unity 中使用的 C# 代码示例
 */
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

/**
 * 导出 Unity 集成辅助函数
 */
export {
  /** C# 示例代码 */
  UNITY_CSHARP_EXAMPLE as UnityCSharpExample,
};

export default UnityAdapter;
