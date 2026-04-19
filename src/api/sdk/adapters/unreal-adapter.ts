// src/api/sdk/adapters/unreal-adapter.ts
/**
 * @fileoverview Unreal Engine 适配器
 * @description 为 Unreal Engine C++ 项目提供调用 xzxllmGame SDK 的辅助类和示例代码
 * @module api/sdk/adapters/unreal-adapter
 * @author xzxllm
 * @license MIT
 *
 * @remarks
 * 此文件为 TypeScript 实现的参考代码，供 Unreal 开发者参考如何将 SDK 集成到 C++ 项目中。
 * 实际使用时需要将此逻辑转换为 C++ 代码，通常通过 HTTP 模块进行通信。
 */

import { GameClientSDK, createSDK } from '../game-client-sdk.js';
import type { SDKConfig, LevelStructure, LevelResult } from '../types.js';

/**
 * Unreal 适配器配置
 */
export interface UnrealAdapterConfig {
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
 * Unreal 关卡数据结构
 * 专为 Unreal Engine 序列化优化的结构
 */
export interface UnrealLevelData {
  /** 关卡唯一标识 */
  LevelId: string;
  /** 难度等级 0.0-1.0 */
  Difficulty: number;
  /** 地图尺寸 X */
  MapSizeX: number;
  /** 地图尺寸 Y */
  MapSizeY: number;
  /** 主题名称 */
  Theme: string;
  /** 玩家起始位置 */
  PlayerStart: UnrealVector2D;
  /** 出口位置 */
  ExitPosition: UnrealVector2D;
  /** 安全区域列表 */
  SafeZones: UnrealVector2D[];
  /** 小游戏区域列表 */
  MiniGames: UnrealMiniGameData[];
  /** 环境元素 */
  AmbientElements: UnrealAmbientElement[];
  /** 开场白 */
  NarrativeText: string;
  /** 对话树 JSON 字符串 */
  DialoguesJson: string;
  /** 预期通关时间（秒） */
  EstimatedTime: number;
  /** 标签列表 */
  Tags: string[];
}

/**
 * Unreal 2D 向量
 */
export interface UnrealVector2D {
  X: number;
  Y: number;
}

/**
 * Unreal 小游戏数据
 */
export interface UnrealMiniGameData {
  /** 区域 ID */
  Id: string;
  /** 游戏类型 */
  Type: string;
  /** 区域位置（左上角） */
  Position: UnrealVector2D;
  /** 区域尺寸 */
  Size: UnrealVector2D;
  /** 游戏配置 JSON */
  ConfigJson: string;
  /** 难度系数 */
  Difficulty: number;
}

/**
 * Unreal 环境元素
 */
export interface UnrealAmbientElement {
  /** 元素类型 */
  Type: string;
  /** 位置 */
  Position: UnrealVector2D;
  /** 旋转角度 */
  Rotation: number;
  /** 缩放 */
  Scale: number;
}

/**
 * Unreal 玩家数据
 */
export interface UnrealPlayerData {
  /** 玩家 ID */
  PlayerId: string;
  /** 技能等级 0.0-1.0 */
  SkillRating: number;
  /** 挫败感等级 */
  FrustrationLevel: number;
  /** 连胜次数 */
  WinStreak: number;
  /** 连败次数 */
  LoseStreak: number;
  /** 关系阶段 */
  RelationshipStage: string;
}

/**
 * Unreal Engine 适配器类
 *
 * 为 Unreal 项目提供简化的接口。
 * 注意：此类展示 TypeScript 实现，Unreal C++ 项目需要参考此逻辑自行实现。
 */
export class UnrealAdapter {
  private sdk: GameClientSDK | null = null;
  private config: UnrealAdapterConfig;

  constructor(config: UnrealAdapterConfig) {
    this.config = config;
  }

  /**
   * 初始化适配器
   * 在 Unreal 的 BeginPlay() 或游戏初始化时调用
   */
  async Initialize(): Promise<boolean> {
    try {
      const sdkConfig: SDKConfig = {
        apiEndpoint: this.config.serverUrl,
        apiKey: this.config.apiKey,
        timeout: this.config.timeout * 1000,
        debug: this.config.debugMode,
        logLevel: this.config.debugMode ? 'debug' : 'info',
      };

      this.sdk = createSDK(sdkConfig);
      await this.sdk.initialize();

      this.Log('UnrealAdapter initialized successfully');
      return true;
    } catch (error: any) {
      this.Error('Failed to initialize UnrealAdapter:', error.message);
      return false;
    }
  }

  /**
   * 请求新关卡
   * 在 Unreal 中使用 Blueprint Async Action 或 C++ 异步调用
   *
   * @param PlayerId 玩家 ID
   * @param SessionId 会话 ID
   * @param Difficulty 难度等级（可选）
   * @param Theme 主题（可选）
   * @returns Unreal 格式的关卡数据
   */
  async RequestLevel(
    PlayerId: string,
    SessionId: string,
    Difficulty?: number,
    Theme?: string
  ): Promise<UnrealLevelData | null> {
    if (!this.sdk) {
      this.Error('UnrealAdapter not initialized');
      return null;
    }

    try {
      const Level = await this.sdk.requestLevel(PlayerId, SessionId, {
        ...(Difficulty !== undefined && { difficulty: Difficulty }),
        ...(Theme !== undefined && { theme: Theme }),
      });

      return this.ConvertToUnrealLevel(Level);
    } catch (error: any) {
      this.Error('Failed to request level:', error.message);
      return null;
    }
  }

  /**
   * 从缓冲池获取预生成关卡
   */
  async GetBufferedLevel(SessionId: string): Promise<UnrealLevelData | null> {
    if (!this.sdk) return null;

    try {
      const Level = await this.sdk.getBufferedLevel(SessionId);
      if (!Level) return null;
      return this.ConvertToUnrealLevel(Level);
    } catch (error: any) {
      this.Error('Failed to get buffered level:', error.message);
      return null;
    }
  }

  /**
   * 提交关卡结果
   *
   * @param Result 关卡结果数据
   */
  async SubmitLevelResult(Result: LevelResult): Promise<boolean> {
    if (!this.sdk) {
      this.Error('UnrealAdapter not initialized');
      return false;
    }

    try {
      return await this.sdk.submitLevelResult(Result);
    } catch (error: any) {
      this.Error('Failed to submit level result:', error.message);
      return false;
    }
  }

  /**
   * 获取玩家数据
   *
   * @param PlayerId 玩家 ID
   * @returns 玩家数据
   */
  async GetPlayerData(PlayerId: string): Promise<UnrealPlayerData | null> {
    if (!this.sdk) return null;

    try {
      const Profile = await this.sdk.getPlayerProfile(PlayerId);
      if (!Profile) return null;

      return {
        PlayerId: Profile.playerId,
        SkillRating: Profile.skillRating,
        FrustrationLevel: Profile.frustrationLevel,
        WinStreak: Profile.winStreak,
        LoseStreak: Profile.loseStreak,
        RelationshipStage: Profile.relationshipStage,
      };
    } catch (error: any) {
      this.Error('Failed to get player data:', error.message);
      return null;
    }
  }

  /**
   * 检查服务健康状态
   */
  async HealthCheck(): Promise<boolean> {
    if (!this.sdk) return false;

    try {
      const Health = await this.sdk.healthCheck();
      return Health.status === 'healthy' || Health.status === 'degraded';
    } catch {
      return false;
    }
  }

  /**
   * 将 SDK 关卡数据转换为 Unreal 格式
   *
   * 此方法将引擎的标准 LevelStructure 转换为 Unreal Engine 可用的优化格式。
   * 转换遵循 Unreal 的命名规范（大驼峰）和数据结构约定。
   * 转换包括：
   * 1. 提取地图尺寸、主题等基础信息
   * 2. 转换玩家起始位置和出口位置为 FVector2D 结构
   * 3. 将安全区域、环境元素转换为 Unreal 格式数组
   * 4. 将小游戏配置序列化为 JSON 字符串供 Unreal 解析
   * 5. 保留叙事文本和对话树 JSON 字符串
   * 6. 提取预估通关时间和标签
   *
   * @param Level 引擎生成的原始关卡数据
   * @returns Unreal 格式的关卡数据
   */
  private ConvertToUnrealLevel(Level: LevelStructure): UnrealLevelData {
    const [SizeX, SizeY] = Level.baseMap.size;

    return {
      LevelId: Level.metadata.id,
      Difficulty: Level.metadata.totalDifficulty,
      MapSizeX: SizeX,
      MapSizeY: SizeY,
      Theme: String(Level.baseMap.theme),
      PlayerStart: {
        X: Level.baseMap.playerStart.x,
        Y: Level.baseMap.playerStart.y,
      },
      ExitPosition: {
        X: Level.baseMap.exitPosition.x,
        Y: Level.baseMap.exitPosition.y,
      },
      SafeZones: Level.baseMap.safeZones?.map((z) => ({ X: z.x, Y: z.y })) || [],
      MiniGames: Level.miniGames.map((mg) => ({
        Id: mg.id,
        Type: mg.type,
        Position: { X: mg.bounds.x, Y: mg.bounds.y },
        Size: { X: mg.bounds.w, Y: mg.bounds.h },
        ConfigJson: JSON.stringify(mg.config),
        Difficulty: mg.difficulty || Level.metadata.totalDifficulty,
      })),
      AmbientElements:
        Level.baseMap.ambientElements?.map((e: any) => ({
          Type: e.type,
          Position: { X: e.x, Y: e.y },
          Rotation: e.rotation || 0,
          Scale: e.scale || 1.0,
        })) || [],
      NarrativeText: Level.narrativeBridge,
      DialoguesJson: JSON.stringify(Level.dialogues),
      EstimatedTime: Level.metadata.estimatedTime,
      Tags: Level.metadata.tags,
    };
  }

  /**
   * 销毁适配器
   * 在 Unreal 的 EndPlay() 中调用
   */
  async Dispose(): Promise<void> {
    if (this.sdk) {
      await this.sdk.dispose();
      this.sdk = null;
    }
    this.Log('UnrealAdapter disposed');
  }

  /**
   * 内部日志输出方法，仅在调试模式下输出
   *
   * 根据 UnrealAdapterConfig.debugMode 配置决定是否输出日志。
   * 所有日志消息都带有 [UnrealAdapter] 前缀以便识别。
   *
   * @param args 日志参数，支持多个参数
   */
  private Log(...args: any[]): void {
    if (this.config.debugMode) {
      console.log('[UnrealAdapter]', ...args);
    }
  }

  /**
   * 内部错误输出方法，始终输出到控制台
   *
   * 用于记录适配器运行中的错误和异常，帮助调试集成问题。
   * 所有错误消息都带有 [UnrealAdapter] 前缀以便识别。
   *
   * @param args 错误参数，支持多个参数
   */
  private Error(...args: any[]): void {
    console.error('[UnrealAdapter]', ...args);
  }
}

/**
 * Unreal C++ 集成示例代码
 * 此字符串包含可在 Unreal 中使用的 C++ 代码示例
 */
export const UNREAL_CPP_EXAMPLE = `
// XZXLLMGameClient.h
#pragma once

#include "CoreMinimal.h"
#include "UObject/NoExportTypes.h"
#include "XZXLLMGameClient.generated.h"

// 关卡数据结构
USTRUCT(BlueprintType)
struct FLevelData
{
    GENERATED_BODY()

    UPROPERTY(BlueprintReadOnly)
    FString LevelId;

    UPROPERTY(BlueprintReadOnly)
    float Difficulty;

    UPROPERTY(BlueprintReadOnly)
    int32 MapSizeX;

    UPROPERTY(BlueprintReadOnly)
    int32 MapSizeY;

    UPROPERTY(BlueprintReadOnly)
    FString Theme;

    UPROPERTY(BlueprintReadOnly)
    FVector2D PlayerStart;

    UPROPERTY(BlueprintReadOnly)
    FVector2D ExitPosition;

    UPROPERTY(BlueprintReadOnly)
    FString NarrativeText;
};

// 异步操作基类
DECLARE_DYNAMIC_MULTICAST_DELEGATE_OneParam(FOnLevelReceived, const FLevelData&, LevelData);
DECLARE_DYNAMIC_MULTICAST_DELEGATE_OneParam(FOnRequestFailed, const FString&, ErrorMessage);

UCLASS()
class YOURGAME_API UXZXLLMGameClient : public UObject
{
    GENERATED_BODY()

public:
    UFUNCTION(BlueprintCallable, Category = "XZXLLMGame")
    static UXZXLLMGameClient* CreateClient(const FString& ServerUrl, const FString& ApiKey);

    UFUNCTION(BlueprintCallable, Category = "XZXLLMGame")
    void RequestLevel(
        const FString& PlayerId,
        const FString& SessionId,
        float Difficulty = 0.5f,
        const FString& Theme = TEXT(""));

    UPROPERTY(BlueprintAssignable, Category = "XZXLLMGame")
    FOnLevelReceived OnLevelReceived;

    UPROPERTY(BlueprintAssignable, Category = "XZXLLMGame")
    FOnRequestFailed OnRequestFailed;

private:
    FString ServerUrl;
    FString ApiKey;
    float Timeout = 30.0f;

    void OnRequestComplete(FHttpRequestPtr Request, FHttpResponsePtr Response, bool bSuccess);
};

// XZXLLMGameClient.cpp
#include "XZXLLMGameClient.h"
#include "HttpModule.h"
#include "Interfaces/IHttpRequest.h"
#include "Interfaces/IHttpResponse.h"
#include "JsonObjectConverter.h"

UXZXLLMGameClient* UXZXLLMGameClient::CreateClient(const FString& ServerUrl, const FString& ApiKey)
{
    UXZXLLMGameClient* Client = NewObject<UXZXLLMGameClient>();
    Client->ServerUrl = ServerUrl;
    Client->ApiKey = ApiKey;
    return Client;
}

void UXZXLLMGameClient::RequestLevel(
    const FString& PlayerId,
    const FString& SessionId,
    float Difficulty,
    const FString& Theme)
{
    TSharedRef<IHttpRequest, ESPMode::ThreadSafe> Request = FHttpModule::Get().CreateRequest();
    Request->SetURL(FString::Printf(TEXT("%s/api/levels"), *ServerUrl));
    Request->SetVerb(TEXT("POST"));
    Request->SetHeader(TEXT("Content-Type"), TEXT("application/json"));
    Request->SetHeader(TEXT("X-API-Key"), ApiKey);

    // 构建请求 JSON
    TSharedPtr<FJsonObject> JsonObject = MakeShareable(new FJsonObject);
    JsonObject->SetStringField(TEXT("playerId"), PlayerId);
    JsonObject->SetStringField(TEXT("sessionId"), SessionId);
    JsonObject->SetNumberField(TEXT("difficulty"), Difficulty);
    if (!Theme.IsEmpty())
    {
        JsonObject->SetStringField(TEXT("theme"), Theme);
    }

    FString OutputString;
    TSharedRef<TJsonWriter<>> Writer = TJsonWriterFactory<>::Create(&OutputString);
    FJsonSerializer::Serialize(JsonObject.ToSharedRef(), Writer);

    Request->SetContentAsString(OutputString);
    Request->OnProcessRequestComplete().BindUObject(this, &UXZXLLMGameClient::OnRequestComplete);
    Request->ProcessRequest();
}

void UXZXLLMGameClient::OnRequestComplete(
    FHttpRequestPtr Request,
    FHttpResponsePtr Response,
    bool bSuccess)
{
    if (!bSuccess || !Response.IsValid())
    {
        OnRequestFailed.Broadcast(TEXT("Network request failed"));
        return;
    }

    if (Response->GetResponseCode() != 200)
    {
        OnRequestFailed.Broadcast(FString::Printf(
            TEXT("HTTP Error: %d"), Response->GetResponseCode()));
        return;
    }

    // 解析响应 JSON
    FString ResponseContent = Response->GetContentAsString();
    TSharedPtr<FJsonObject> JsonObject;
    TSharedRef<TJsonReader<>> Reader = TJsonReaderFactory<>::Create(ResponseContent);

    if (FJsonSerializer::Deserialize(Reader, JsonObject) && JsonObject.IsValid())
    {
        bool bSuccess = JsonObject->GetBoolField(TEXT("success"));
        if (!bSuccess)
        {
            FString ErrorMessage = JsonObject->GetStringField(TEXT("error"));
            OnRequestFailed.Broadcast(ErrorMessage);
            return;
        }

        // 解析关卡数据
        TSharedPtr<FJsonObject> DataObject = JsonObject->GetObjectField(TEXT("data"));
        FLevelData LevelData;
        LevelData.LevelId = DataObject->GetStringField(TEXT("metadata"));
        // ... 解析其他字段

        OnLevelReceived.Broadcast(LevelData);
    }
    else
    {
        OnRequestFailed.Broadcast(TEXT("Failed to parse response"));
    }
}
`;

/**
 * Blueprint 节点使用示例
 */
export const UNREAL_BLUEPRINT_EXAMPLE = `
/*
在 Blueprint 中使用 XZXLLMGameClient：

1. 创建 Client 实例
   - 在 GameInstance 或自定义 Manager 中
   - 调用 CreateClient 节点，传入 ServerUrl 和 ApiKey

2. 请求关卡
   - 绑定 OnLevelReceived 事件
   - 绑定 OnRequestFailed 事件
   - 调用 RequestLevel 节点

3. 处理响应
   - 在 OnLevelReceived 中，使用返回的 LevelData
   - 生成地图、放置元素、显示叙事文本

4. 提交结果
   - 玩家完成关卡后
   - 调用 SubmitLevelResult 节点

示例 Blueprint 图表：

[BeginPlay]
    |
    v
[Create Client] --> [Store in Variable]
    |
    v
[Request Level] --> [Bind Events]
    |
    v
[On Level Received] --> [Spawn Level Actors]
    |
    v
[Player Completes Level] --> [Submit Level Result]
*/
`;

/**
 * 导出 Unreal 集成辅助
 */
export {
  UNREAL_CPP_EXAMPLE as UnrealCppExample,
  UNREAL_BLUEPRINT_EXAMPLE as UnrealBlueprintExample,
};

export default UnrealAdapter;
