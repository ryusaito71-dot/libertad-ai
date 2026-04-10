# HARNESS.md — development ハーネス運用

## 目的

Planner・Generator・Evaluatorの3エージェントを連携させ、要求の受け取りから実装・検証・納品までを一貫して管理する。

## 基本フロー

```
PMからの要求
    ↓
Planner（仕様分解・タスク計画）
    ↓
Generator（スプリント実装・自己評価）
    ↓
Evaluator（実アプリ検証）
    ↓ 合格
QAへ渡す
```

## スプリント運用

1. PlannerがスプリントごとのタスクリストをGeneratorに渡す
2. GeneratorはタスクをPlannerの仕様に従い1つずつ実装する
3. 各スプリント末にGeneratorが自己評価を行い、Evaluatorへ提出する
4. Evaluatorが検証し、合格・差し戻しを判定する

## 差し戻しルール

| 差し戻し先 | 条件 |
|-----------|------|
| Generator | 実装バグ・動作不良・仕様との不一致 |
| Planner   | 仕様の不足・要求の不整合・実現不可能な要件 |

## 人間承認ポイント

以下のタイミングで人間の確認を必須とする。

- Plannerが作成した仕様・タスク計画のレビュー
- Evaluatorが「合格」と判定した成果物のQA渡し判断
- セキュリティ・アーキテクチャに関わる設計判断
