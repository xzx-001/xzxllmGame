import { createSDK } from '../game-client-sdk.js';
export class UnrealAdapter {
    sdk = null;
    config;
    constructor(config) {
        this.config = config;
    }
    async Initialize() {
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
            this.Log('UnrealAdapter initialized successfully');
            return true;
        }
        catch (error) {
            this.Error('Failed to initialize UnrealAdapter:', error.message);
            return false;
        }
    }
    async RequestLevel(PlayerId, SessionId, Difficulty, Theme) {
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
        }
        catch (error) {
            this.Error('Failed to request level:', error.message);
            return null;
        }
    }
    async GetBufferedLevel(SessionId) {
        if (!this.sdk)
            return null;
        try {
            const Level = await this.sdk.getBufferedLevel(SessionId);
            if (!Level)
                return null;
            return this.ConvertToUnrealLevel(Level);
        }
        catch (error) {
            this.Error('Failed to get buffered level:', error.message);
            return null;
        }
    }
    async SubmitLevelResult(Result) {
        if (!this.sdk) {
            this.Error('UnrealAdapter not initialized');
            return false;
        }
        try {
            return await this.sdk.submitLevelResult(Result);
        }
        catch (error) {
            this.Error('Failed to submit level result:', error.message);
            return false;
        }
    }
    async GetPlayerData(PlayerId) {
        if (!this.sdk)
            return null;
        try {
            const Profile = await this.sdk.getPlayerProfile(PlayerId);
            if (!Profile)
                return null;
            return {
                PlayerId: Profile.playerId,
                SkillRating: Profile.skillRating,
                FrustrationLevel: Profile.frustrationLevel,
                WinStreak: Profile.winStreak,
                LoseStreak: Profile.loseStreak,
                RelationshipStage: Profile.relationshipStage,
            };
        }
        catch (error) {
            this.Error('Failed to get player data:', error.message);
            return null;
        }
    }
    async HealthCheck() {
        if (!this.sdk)
            return false;
        try {
            const Health = await this.sdk.healthCheck();
            return Health.status === 'healthy' || Health.status === 'degraded';
        }
        catch {
            return false;
        }
    }
    ConvertToUnrealLevel(Level) {
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
            AmbientElements: Level.baseMap.ambientElements?.map((e) => ({
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
    async Dispose() {
        if (this.sdk) {
            await this.sdk.dispose();
            this.sdk = null;
        }
        this.Log('UnrealAdapter disposed');
    }
    Log(...args) {
        if (this.config.debugMode) {
            console.log('[UnrealAdapter]', ...args);
        }
    }
    Error(...args) {
        console.error('[UnrealAdapter]', ...args);
    }
}
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
export { UNREAL_CPP_EXAMPLE as UnrealCppExample, UNREAL_BLUEPRINT_EXAMPLE as UnrealBlueprintExample, };
export default UnrealAdapter;
//# sourceMappingURL=unreal-adapter.js.map