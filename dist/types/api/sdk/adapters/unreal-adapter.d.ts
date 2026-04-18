import type { LevelResult } from '../types.js';
export interface UnrealAdapterConfig {
    serverUrl: string;
    apiKey: string;
    timeout: number;
    debugMode: boolean;
}
export interface UnrealLevelData {
    LevelId: string;
    Difficulty: number;
    MapSizeX: number;
    MapSizeY: number;
    Theme: string;
    PlayerStart: UnrealVector2D;
    ExitPosition: UnrealVector2D;
    SafeZones: UnrealVector2D[];
    MiniGames: UnrealMiniGameData[];
    AmbientElements: UnrealAmbientElement[];
    NarrativeText: string;
    DialoguesJson: string;
    EstimatedTime: number;
    Tags: string[];
}
export interface UnrealVector2D {
    X: number;
    Y: number;
}
export interface UnrealMiniGameData {
    Id: string;
    Type: string;
    Position: UnrealVector2D;
    Size: UnrealVector2D;
    ConfigJson: string;
    Difficulty: number;
}
export interface UnrealAmbientElement {
    Type: string;
    Position: UnrealVector2D;
    Rotation: number;
    Scale: number;
}
export interface UnrealPlayerData {
    PlayerId: string;
    SkillRating: number;
    FrustrationLevel: number;
    WinStreak: number;
    LoseStreak: number;
    RelationshipStage: string;
}
export declare class UnrealAdapter {
    private sdk;
    private config;
    constructor(config: UnrealAdapterConfig);
    Initialize(): Promise<boolean>;
    RequestLevel(PlayerId: string, SessionId: string, Difficulty?: number, Theme?: string): Promise<UnrealLevelData | null>;
    GetBufferedLevel(SessionId: string): Promise<UnrealLevelData | null>;
    SubmitLevelResult(Result: LevelResult): Promise<boolean>;
    GetPlayerData(PlayerId: string): Promise<UnrealPlayerData | null>;
    HealthCheck(): Promise<boolean>;
    private ConvertToUnrealLevel;
    Dispose(): Promise<void>;
    private Log;
    private Error;
}
export declare const UNREAL_CPP_EXAMPLE = "\n// XZXLLMGameClient.h\n#pragma once\n\n#include \"CoreMinimal.h\"\n#include \"UObject/NoExportTypes.h\"\n#include \"XZXLLMGameClient.generated.h\"\n\n// \u5173\u5361\u6570\u636E\u7ED3\u6784\nUSTRUCT(BlueprintType)\nstruct FLevelData\n{\n    GENERATED_BODY()\n\n    UPROPERTY(BlueprintReadOnly)\n    FString LevelId;\n\n    UPROPERTY(BlueprintReadOnly)\n    float Difficulty;\n\n    UPROPERTY(BlueprintReadOnly)\n    int32 MapSizeX;\n\n    UPROPERTY(BlueprintReadOnly)\n    int32 MapSizeY;\n\n    UPROPERTY(BlueprintReadOnly)\n    FString Theme;\n\n    UPROPERTY(BlueprintReadOnly)\n    FVector2D PlayerStart;\n\n    UPROPERTY(BlueprintReadOnly)\n    FVector2D ExitPosition;\n\n    UPROPERTY(BlueprintReadOnly)\n    FString NarrativeText;\n};\n\n// \u5F02\u6B65\u64CD\u4F5C\u57FA\u7C7B\nDECLARE_DYNAMIC_MULTICAST_DELEGATE_OneParam(FOnLevelReceived, const FLevelData&, LevelData);\nDECLARE_DYNAMIC_MULTICAST_DELEGATE_OneParam(FOnRequestFailed, const FString&, ErrorMessage);\n\nUCLASS()\nclass YOURGAME_API UXZXLLMGameClient : public UObject\n{\n    GENERATED_BODY()\n\npublic:\n    UFUNCTION(BlueprintCallable, Category = \"XZXLLMGame\")\n    static UXZXLLMGameClient* CreateClient(const FString& ServerUrl, const FString& ApiKey);\n\n    UFUNCTION(BlueprintCallable, Category = \"XZXLLMGame\")\n    void RequestLevel(\n        const FString& PlayerId,\n        const FString& SessionId,\n        float Difficulty = 0.5f,\n        const FString& Theme = TEXT(\"\"));\n\n    UPROPERTY(BlueprintAssignable, Category = \"XZXLLMGame\")\n    FOnLevelReceived OnLevelReceived;\n\n    UPROPERTY(BlueprintAssignable, Category = \"XZXLLMGame\")\n    FOnRequestFailed OnRequestFailed;\n\nprivate:\n    FString ServerUrl;\n    FString ApiKey;\n    float Timeout = 30.0f;\n\n    void OnRequestComplete(FHttpRequestPtr Request, FHttpResponsePtr Response, bool bSuccess);\n};\n\n// XZXLLMGameClient.cpp\n#include \"XZXLLMGameClient.h\"\n#include \"HttpModule.h\"\n#include \"Interfaces/IHttpRequest.h\"\n#include \"Interfaces/IHttpResponse.h\"\n#include \"JsonObjectConverter.h\"\n\nUXZXLLMGameClient* UXZXLLMGameClient::CreateClient(const FString& ServerUrl, const FString& ApiKey)\n{\n    UXZXLLMGameClient* Client = NewObject<UXZXLLMGameClient>();\n    Client->ServerUrl = ServerUrl;\n    Client->ApiKey = ApiKey;\n    return Client;\n}\n\nvoid UXZXLLMGameClient::RequestLevel(\n    const FString& PlayerId,\n    const FString& SessionId,\n    float Difficulty,\n    const FString& Theme)\n{\n    TSharedRef<IHttpRequest, ESPMode::ThreadSafe> Request = FHttpModule::Get().CreateRequest();\n    Request->SetURL(FString::Printf(TEXT(\"%s/api/levels\"), *ServerUrl));\n    Request->SetVerb(TEXT(\"POST\"));\n    Request->SetHeader(TEXT(\"Content-Type\"), TEXT(\"application/json\"));\n    Request->SetHeader(TEXT(\"X-API-Key\"), ApiKey);\n\n    // \u6784\u5EFA\u8BF7\u6C42 JSON\n    TSharedPtr<FJsonObject> JsonObject = MakeShareable(new FJsonObject);\n    JsonObject->SetStringField(TEXT(\"playerId\"), PlayerId);\n    JsonObject->SetStringField(TEXT(\"sessionId\"), SessionId);\n    JsonObject->SetNumberField(TEXT(\"difficulty\"), Difficulty);\n    if (!Theme.IsEmpty())\n    {\n        JsonObject->SetStringField(TEXT(\"theme\"), Theme);\n    }\n\n    FString OutputString;\n    TSharedRef<TJsonWriter<>> Writer = TJsonWriterFactory<>::Create(&OutputString);\n    FJsonSerializer::Serialize(JsonObject.ToSharedRef(), Writer);\n\n    Request->SetContentAsString(OutputString);\n    Request->OnProcessRequestComplete().BindUObject(this, &UXZXLLMGameClient::OnRequestComplete);\n    Request->ProcessRequest();\n}\n\nvoid UXZXLLMGameClient::OnRequestComplete(\n    FHttpRequestPtr Request,\n    FHttpResponsePtr Response,\n    bool bSuccess)\n{\n    if (!bSuccess || !Response.IsValid())\n    {\n        OnRequestFailed.Broadcast(TEXT(\"Network request failed\"));\n        return;\n    }\n\n    if (Response->GetResponseCode() != 200)\n    {\n        OnRequestFailed.Broadcast(FString::Printf(\n            TEXT(\"HTTP Error: %d\"), Response->GetResponseCode()));\n        return;\n    }\n\n    // \u89E3\u6790\u54CD\u5E94 JSON\n    FString ResponseContent = Response->GetContentAsString();\n    TSharedPtr<FJsonObject> JsonObject;\n    TSharedRef<TJsonReader<>> Reader = TJsonReaderFactory<>::Create(ResponseContent);\n\n    if (FJsonSerializer::Deserialize(Reader, JsonObject) && JsonObject.IsValid())\n    {\n        bool bSuccess = JsonObject->GetBoolField(TEXT(\"success\"));\n        if (!bSuccess)\n        {\n            FString ErrorMessage = JsonObject->GetStringField(TEXT(\"error\"));\n            OnRequestFailed.Broadcast(ErrorMessage);\n            return;\n        }\n\n        // \u89E3\u6790\u5173\u5361\u6570\u636E\n        TSharedPtr<FJsonObject> DataObject = JsonObject->GetObjectField(TEXT(\"data\"));\n        FLevelData LevelData;\n        LevelData.LevelId = DataObject->GetStringField(TEXT(\"metadata\"));\n        // ... \u89E3\u6790\u5176\u4ED6\u5B57\u6BB5\n\n        OnLevelReceived.Broadcast(LevelData);\n    }\n    else\n    {\n        OnRequestFailed.Broadcast(TEXT(\"Failed to parse response\"));\n    }\n}\n";
export declare const UNREAL_BLUEPRINT_EXAMPLE = "\n/*\n\u5728 Blueprint \u4E2D\u4F7F\u7528 XZXLLMGameClient\uFF1A\n\n1. \u521B\u5EFA Client \u5B9E\u4F8B\n   - \u5728 GameInstance \u6216\u81EA\u5B9A\u4E49 Manager \u4E2D\n   - \u8C03\u7528 CreateClient \u8282\u70B9\uFF0C\u4F20\u5165 ServerUrl \u548C ApiKey\n\n2. \u8BF7\u6C42\u5173\u5361\n   - \u7ED1\u5B9A OnLevelReceived \u4E8B\u4EF6\n   - \u7ED1\u5B9A OnRequestFailed \u4E8B\u4EF6\n   - \u8C03\u7528 RequestLevel \u8282\u70B9\n\n3. \u5904\u7406\u54CD\u5E94\n   - \u5728 OnLevelReceived \u4E2D\uFF0C\u4F7F\u7528\u8FD4\u56DE\u7684 LevelData\n   - \u751F\u6210\u5730\u56FE\u3001\u653E\u7F6E\u5143\u7D20\u3001\u663E\u793A\u53D9\u4E8B\u6587\u672C\n\n4. \u63D0\u4EA4\u7ED3\u679C\n   - \u73A9\u5BB6\u5B8C\u6210\u5173\u5361\u540E\n   - \u8C03\u7528 SubmitLevelResult \u8282\u70B9\n\n\u793A\u4F8B Blueprint \u56FE\u8868\uFF1A\n\n[BeginPlay]\n    |\n    v\n[Create Client] --> [Store in Variable]\n    |\n    v\n[Request Level] --> [Bind Events]\n    |\n    v\n[On Level Received] --> [Spawn Level Actors]\n    |\n    v\n[Player Completes Level] --> [Submit Level Result]\n*/\n";
export { UNREAL_CPP_EXAMPLE as UnrealCppExample, UNREAL_BLUEPRINT_EXAMPLE as UnrealBlueprintExample, };
export default UnrealAdapter;
//# sourceMappingURL=unreal-adapter.d.ts.map