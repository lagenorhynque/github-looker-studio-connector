import Fields = GoogleAppsScript.Data_Studio.Fields;

const cc = DataStudioApp.createCommunityConnector();
const API_KEY_PROPERTY = 'githubConnector.key';

/* 認証 */

function getAuthType(): GetAuthTypeResponse {
  return (
    cc
      .newAuthTypeResponse()
      .setAuthType(cc.AuthType.KEY)
      // NOTE: コネクタ認証時のヘルプページを案内する場合に
      // .setHelpUrl('https://www.example.org/connector-auth-help')
      .build()
  );
}

function resetAuth() {
  const userProperties = PropertiesService.getUserProperties();
  userProperties.deleteProperty(API_KEY_PROPERTY);
}

function isAuthValid() {
  const userProperties = PropertiesService.getUserProperties();
  const apiKey = userProperties.getProperty(API_KEY_PROPERTY);
  return apiKey !== null && apiKey !== '';
}

function setCredentials(request: KeyCredentials): SetCredentialsResponse {
  const key = request.key;

  // NOTE: APIキーの有効性を保存前に検証する場合に
  // const validKey = checkForValidKey(key);
  // if (!validKey) {
  //   return {
  //     errorCode: 'INVALID_CREDENTIALS'
  //   };
  // }

  const userProperties = PropertiesService.getUserProperties();
  userProperties.setProperty(API_KEY_PROPERTY, key);
  return {
    errorCode: 'NONE',
  };
}

/* 設定 */

function getConfig() {
  const config = cc.getConfig();
  config
    .newInfo()
    .setId('instructions')
    .setText('データ取得対象を指定してください🐬');
  config
    .newTextInput()
    .setId('repoSearchQuery')
    .setName('GitHubのリポジトリ検索クエリ')
    .setHelpText(
      'https://docs.github.com/ja/search-github/getting-started-with-searching-on-github/understanding-the-search-syntax'
    )
    .setPlaceholder('owner:lagenorhynque sort:updated');

  // NOTE: データ取得時に期間指定のパラメータが必要な場合に
  // config.setDateRangeRequired(true);

  return config.build();
}

/* スキーマ */

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function getSchema(request: GetSchemaRequest): GetSchemaResponse {
  const fields = getFields().build();
  return { schema: fields };
}

function getFields() {
  const fields = cc.getFields();
  const types = cc.FieldType;

  fields.newDimension().setId('name').setType(types.TEXT);
  fields.newMetric().setId('description').setType(types.TEXT);
  fields.newMetric().setId('url').setType(types.URL);
  fields.newMetric().setId('createdAt').setType(types.TEXT);
  fields.newMetric().setId('updatedAt').setType(types.TEXT);
  fields.newMetric().setId('stargazerCount').setType(types.NUMBER);

  return fields;
}

/* データ */

function getData(request: GetDataRequest): GetDataResponse {
  const requestedFieldIds = request.fields.map(field => field.name);
  const requestedFields = getFields().forIds(requestedFieldIds);
  const userProperties = PropertiesService.getUserProperties();
  const apiKey = userProperties.getProperty(API_KEY_PROPERTY);
  const parsedResponseData = callGitHubGraphQLApi(
    apiKey ?? '',
    request.configParams?.repoSearchQuery ?? ''
  );
  return {
    schema: requestedFields.build(),
    rows: responseToRows(requestedFields, parsedResponseData),
  };
}

function responseToRows(
  requestedFields: Fields,
  responseData: QueryResponseData
): GetDataRows {
  const fieldIds = requestedFields.asArray().map(f => f.getId());
  return responseData.search.nodes.map(node => {
    return {
      values: fieldIds.map(fieldId => {
        switch (fieldId) {
          case 'name':
            return node.name;
          case 'description':
            return node.description;
          case 'url':
            return node.url;
          case 'createdAt':
            return node.createdAt;
          case 'updatedAt':
            return node.updatedAt;
          case 'stargazerCount':
            return node.stargazerCount;
          default:
            return '';
        }
      }),
    };
  });
}

const QUERY = `
query ($repoSearchQuery: String!, $first: Int = 100) {
  search(type: REPOSITORY, query: $repoSearchQuery, first: $first) {
    nodes {
      ... on Repository {
        name
        description
        url
        createdAt
        updatedAt
        stargazerCount
      }
    }
  }
}
`;

interface QueryResponseData {
  search: {
    nodes: {
      name: string;
      description: string;
      url: string;
      createdAt: string;
      updatedAt: string;
      stargazerCount: number;
    }[];
  };
}

function callGitHubGraphQLApi(apiKey: string, repoSearchQuery: string) {
  const url = 'https://api.github.com/graphql';
  const body = {
    query: QUERY,
    variables: { repoSearchQuery: repoSearchQuery },
  };
  const response = UrlFetchApp.fetch(url, {
    method: 'post',
    contentType: 'application/json',
    headers: { Authorization: `bearer ${apiKey}` },
    payload: JSON.stringify(body),
  });
  return JSON.parse(response.getContentText()).data;
}
