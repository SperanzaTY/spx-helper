"""
站点查询 HTTP API 服务
提供 RESTful API 接口
"""

from flask import Flask, jsonify, request
from flask_cors import CORS
import yaml
import logging
import argparse
import time
from station_query import StationQuery


# 初始化 Flask 应用
app = Flask(__name__)
CORS(app)  # 允许跨域请求

# 全局变量
query_service = None
config = None

# 配置日志
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger("StationAPI")


def load_config(config_path: str = 'config/clickhouse.yaml'):
    """加载配置文件"""
    try:
        with open(config_path, 'r', encoding='utf-8') as f:
            return yaml.safe_load(f)
    except Exception as e:
        logger.error(f"加载配置文件失败: {e}")
        raise


def init_query_service():
    """初始化查询服务"""
    global query_service, config
    
    config = load_config()
    
    clickhouse_config = config['online2']
    markets = config.get('markets', None)
    max_workers = config.get('query', {}).get('max_workers', 8)
    
    query_service = StationQuery(
        clickhouse_config=clickhouse_config,
        markets=markets,
        max_workers=max_workers
    )
    
    # 测试连接
    if query_service.test_connection():
        logger.info("✅ ClickHouse 连接测试成功")
    else:
        logger.error("❌ ClickHouse 连接测试失败")
        raise Exception("无法连接到 ClickHouse")


@app.route('/health', methods=['GET'])
def health_check():
    """健康检查"""
    return jsonify({
        'status': 'ok',
        'service': 'station-query-api',
        'timestamp': int(time.time())
    })


@app.route('/station/id/<int:station_id>', methods=['GET'])
def query_by_id(station_id):
    """
    根据站点 ID 查询
    
    Query Params:
        - market: 指定市场（可选）
    
    Example:
        GET /station/id/123456
        GET /station/id/123456?market=id
    """
    try:
        market = request.args.get('market', None)
        
        start_time = time.time()
        results = query_service.query_by_id(station_id, market=market)
        elapsed = time.time() - start_time
        
        return jsonify({
            'success': True,
            'data': results,
            'count': len(results),
            'query_time': f"{elapsed:.2f}s"
        })
    
    except Exception as e:
        logger.error(f"查询失败: {e}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@app.route('/station/name/<station_name>', methods=['GET'])
def query_by_name(station_name):
    """
    根据站点名称模糊搜索
    
    Query Params:
        - market: 指定市场（可选）
        - limit: 返回结果限制（可选，默认 100）
    
    Example:
        GET /station/name/Central%20Hub
        GET /station/name/Central?market=sg&limit=50
    """
    try:
        market = request.args.get('market', None)
        limit = int(request.args.get('limit', 100))
        
        start_time = time.time()
        results = query_service.query_by_name(station_name, market=market, limit=limit)
        elapsed = time.time() - start_time
        
        return jsonify({
            'success': True,
            'data': results,
            'count': len(results),
            'query_time': f"{elapsed:.2f}s"
        })
    
    except Exception as e:
        logger.error(f"搜索失败: {e}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@app.route('/station/batch', methods=['POST'])
def query_batch():
    """
    批量查询多个站点 ID
    
    Request Body:
        {
            "ids": [123, 456, 789],
            "market": "id"  // 可选
        }
    
    Example:
        POST /station/batch
        Body: {"ids": [123, 456, 789]}
    """
    try:
        data = request.get_json()
        
        if not data or 'ids' not in data:
            return jsonify({
                'success': False,
                'error': '缺少必填参数: ids'
            }), 400
        
        station_ids = data['ids']
        market = data.get('market', None)
        
        if not isinstance(station_ids, list) or len(station_ids) == 0:
            return jsonify({
                'success': False,
                'error': 'ids 必须是非空数组'
            }), 400
        
        start_time = time.time()
        results = query_service.query_batch_ids(station_ids, market=market)
        elapsed = time.time() - start_time
        
        return jsonify({
            'success': True,
            'data': results,
            'count': len(results),
            'query_time': f"{elapsed:.2f}s"
        })
    
    except Exception as e:
        logger.error(f"批量查询失败: {e}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@app.route('/markets', methods=['GET'])
def get_markets():
    """获取支持的市场列表"""
    return jsonify({
        'success': True,
        'markets': query_service.markets
    })


@app.errorhandler(404)
def not_found(error):
    """404 错误处理"""
    return jsonify({
        'success': False,
        'error': 'API endpoint not found'
    }), 404


@app.errorhandler(500)
def internal_error(error):
    """500 错误处理"""
    return jsonify({
        'success': False,
        'error': 'Internal server error'
    }), 500


def main():
    """主函数"""
    parser = argparse.ArgumentParser(description='站点查询 HTTP API 服务')
    parser.add_argument('--host', default='0.0.0.0', help='服务监听地址')
    parser.add_argument('--port', type=int, default=8888, help='服务端口')
    parser.add_argument('--config', default='config/clickhouse.yaml', help='配置文件路径')
    parser.add_argument('--debug', action='store_true', help='调试模式')
    
    args = parser.parse_args()
    
    # 初始化服务
    logger.info("正在初始化站点查询服务...")
    init_query_service()
    
    # 启动服务
    logger.info(f"🚀 服务启动: http://{args.host}:{args.port}")
    logger.info(f"📖 API 文档: http://{args.host}:{args.port}/health")
    
    app.run(
        host=args.host,
        port=args.port,
        debug=args.debug
    )


if __name__ == '__main__':
    main()
